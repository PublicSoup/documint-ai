import { WebContainer, WebContainerProcess } from "@webcontainer/api";

type MountTree = Record<
  string,
  { file: { contents: string } } | { directory: MountTree }
>;

interface SpawnOptions {
  args?: string[];
  processId?: string;
  cwd?: string;
  env?: Record<string, string>;
}

const MAX_BOOT_RETRIES = 3;
const BASE_BACKOFF_MS = 400;
const DEFAULT_OP_TIMEOUT_MS = 15_000;

// Persist WebContainer instance and boot state on globalThis to survive
// Next.js HMR / Fast Refresh which re-evaluates module-level state.
// @webcontainer/api enforces a singleton internally, so we must maintain
// the reference across hot reloads to avoid the "Only a single WebContainer
// instance can be booted" error.
const WC_KEY = "__documint_webcontainer";
const WC_BOOT_KEY = "__documint_webcontainer_boot_promise";
const WC_ERROR_KEY = "__documint_webcontainer_boot_error";

function getGlobalInstance(): WebContainer | null {
  return (globalThis as Record<string, unknown>)[WC_KEY] as WebContainer | null;
}
function setGlobalInstance(instance: WebContainer | null): void {
  (globalThis as Record<string, unknown>)[WC_KEY] = instance;
}
function getGlobalBootPromise(): Promise<WebContainer> | null {
  return (globalThis as Record<string, unknown>)[WC_BOOT_KEY] as Promise<WebContainer> | null;
}
function setGlobalBootPromise(promise: Promise<WebContainer> | null): void {
  (globalThis as Record<string, unknown>)[WC_BOOT_KEY] = promise;
}
function getGlobalBootError(): Error | null {
  return (globalThis as Record<string, unknown>)[WC_ERROR_KEY] as Error | null;
}
function setGlobalBootError(error: Error | null): void {
  (globalThis as Record<string, unknown>)[WC_ERROR_KEY] = error;
}
let writeQueue: Promise<void> = Promise.resolve();
const trackedProcesses = new Map<string, WebContainerProcess>();

type WebContainerHealthState = {
  generation: number;
  trackedProcessCount: number;
  recoveryCount: number;
  lastRecoveryAt: string | null;
  lastRecoveryReason: string | null;
};

const runtimeHealth: WebContainerHealthState = {
  generation: 0,
  trackedProcessCount: 0,
  recoveryCount: 0,
  lastRecoveryAt: null,
  lastRecoveryReason: null,
};

type HealthSubscriber = (health: WebContainerHealthState) => void;
const healthSubscribers: Set<HealthSubscriber> = new Set();

function notifyHealthSubscribers(): void {
  runtimeHealth.trackedProcessCount = trackedProcesses.size;
  healthSubscribers.forEach((cb) => cb({ ...runtimeHealth }));
}

function recordRecovery(reason: string): void {
  runtimeHealth.recoveryCount += 1;
  runtimeHealth.lastRecoveryAt = new Date().toISOString();
  runtimeHealth.lastRecoveryReason = reason;
  notifyHealthSubscribers();
}

function trackProcess(processId: string, process: WebContainerProcess): void {
  trackedProcesses.set(processId, process);
  notifyHealthSubscribers();

  process.exit
    .catch(() => {
      // Swallow process exit errors; tracking cleanup still applies.
    })
    .finally(() => {
      if (trackedProcesses.get(processId) === process) {
        trackedProcesses.delete(processId);
        notifyHealthSubscribers();
      }
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoff(attempt: number): number {
  return BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSingleInstanceBootError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("only a single webcontainer instance can be booted") ||
    message.includes("single webcontainer instance") ||
    message.includes("already booted")
  );
}

function isRecoverableWebContainerError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (isSingleInstanceBootError(error)) return false;
  return (
    message.includes("webcontainer") ||
    message.includes("timed out") ||
    message.includes("closed")
  );
}

function assertWebContainerPreflight(): void {
  if (typeof window === "undefined") {
    throw new Error("WebContainer can only boot in a browser environment.");
  }

  if (!globalThis.isSecureContext) {
    throw new Error(
      "WebContainer requires a secure browser context. Use HTTPS or localhost.",
    );
  }

  if (!globalThis.crossOriginIsolated) {
    throw new Error(
      "WebContainer requires cross-origin isolation. Ensure /code sends Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp, and Cross-Origin-Resource-Policy: same-origin.",
    );
  }

  if (typeof globalThis.SharedArrayBuffer === "undefined") {
    throw new Error(
      "WebContainer requires SharedArrayBuffer, but it is unavailable in this browser context.",
    );
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutError = new Error(
        `WebContainer ${operation} timed out after ${timeoutMs}ms`,
      );
      setTimeout(() => reject(timeoutError), timeoutMs);
    }),
  ]);
}

export class WebContainerManager {
  private static async runWithRecovery<T>(
    operation: () => Promise<T>,
    operationName: string,
    timeoutMs = DEFAULT_OP_TIMEOUT_MS,
  ): Promise<T> {
    try {
      return await withTimeout(
        operation(),
        timeoutMs,
        operationName,
      );
    } catch (error) {
      const message = getErrorMessage(error).toLowerCase();

      if (!isRecoverableWebContainerError(error)) {
        throw error;
      }

      recordRecovery(`${operationName}: ${message || "recoverable failure"}`);
      await this.reset(`recovered after ${operationName}`);
      return await withTimeout(
        operation(),
        timeoutMs,
        `${operationName} (retry)`,
      );
    }
  }

  static async getInstance(): Promise<WebContainer> {
    const existing = getGlobalInstance();
    if (existing) {
      return existing;
    }

    // Don't cache boot errors across HMR — let fresh boots attempt recovery.
    // The error is still thrown for the current attempt, but cleared so next call retries.
    setGlobalBootError(null);

    const pendingBoot = getGlobalBootPromise();
    if (pendingBoot) {
      return pendingBoot;
    }

    const bootPromise = this.bootWithRetry();
    setGlobalBootPromise(bootPromise);

    try {
      const instance = await bootPromise;
      setGlobalInstance(instance);
      setGlobalBootError(null);
      return instance;
    } finally {
      setGlobalBootPromise(null);
    }
  }

  private static async bootWithRetry(): Promise<WebContainer> {
    // WebContainer boots by injecting a hidden iframe (https://stackblitz.com/headless)
    // and waiting for its `init` postMessage. If CSP blocks that iframe the handshake
    // never fires and boot just hangs until our timeout — with no native error saying
    // why. Capture any Content-Security-Policy violations against WebContainer hosts so
    // the failure surfaces the blocked directive/URL instead of a bare "timed out".
    const cspViolations: string[] = [];
    const onCspViolation = (event: SecurityPolicyViolationEvent) => {
      if (/stackblitz|staticblitz|webcontainer/i.test(event.blockedURI)) {
        cspViolations.push(
          `${event.effectiveDirective} blocked ${event.blockedURI}`,
        );
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("securitypolicyviolation", onCspViolation);
    }

    try {
      assertWebContainerPreflight();
      // The `coep` option MUST match the COEP header sent for /code in src/proxy.ts.
      // It is fixed on first boot and cannot be changed across reboots; a mismatch
      // (e.g. header `credentialless` vs library default `require-corp`) corrupts the
      // cross-origin-isolated context and makes boot reject.

      const bootOperation = async () => {
        const instance = await WebContainer.boot({ coep: "credentialless" });

        // Provision essential environment config immediately after boot.
        // WebContainer's npm does not support HTTPS; force HTTP registry
        // so npm install / npx work regardless of how they are spawned.
        // This covers the interactive terminal, auto-run, and any other
        // npm/npx invocation path.
        await instance.fs.writeFile(
          "/home/.npmrc",
          ["registry=http://registry.npmjs.org/", "strict-ssl=false"].join(
            "\n",
          ),
        );

        return instance;
      };

      return await withTimeout(bootOperation(), 30_000, "boot");
    } catch (error) {
      console.error("[WebContainer Boot Error]:", error);
      let message = getErrorMessage(error);
      if (cspViolations.length > 0) {
        message += ` — Content-Security-Policy blocked WebContainer hosts: ${[...new Set(cspViolations)].join("; ")}. Allow these origins in the /code CSP (see src/proxy.ts).`;
      }
      const bootError = new Error(message);
      setGlobalBootError(bootError);
      throw bootError;
    } finally {
      if (typeof document !== "undefined") {
        document.removeEventListener("securitypolicyviolation", onCspViolation);
      }
    }
  }

  static async mountFiles(files: MountTree): Promise<void> {
    await this.runWithRecovery(async () => {
      const instance = await this.getInstance();
      await instance.mount(files);
    }, "mount files");
  }

  static async writeFile(path: string, content: string): Promise<void> {
    writeQueue = writeQueue.then(async () => {
      await this.runWithRecovery(async () => {
        const instance = await this.getInstance();
        await instance.fs.writeFile(path, content);
      }, `write file ${path}`);
    });

    return writeQueue;
  }

  static async readFile(path: string): Promise<string> {
    return await this.runWithRecovery(async () => {
      const instance = await this.getInstance();
      const content = await instance.fs.readFile(path, "utf-8");
      return content;
    }, `read file ${path}`);
  }

  static async spawn(
    command: string,
    options: SpawnOptions = {},
  ): Promise<WebContainerProcess> {
    const instance = await this.getInstance();
    const spawnOpts =
      options.cwd || options.env
        ? { cwd: options.cwd, env: options.env }
        : undefined;
    const process = await instance.spawn(command, options.args ?? [], spawnOpts);

    if (options.processId) {
      trackProcess(options.processId, process);
    }

    return process;
  }

  static async killProcess(processId: string): Promise<void> {
    const process = trackedProcesses.get(processId);
    if (!process) {
      return;
    }

    try {
      process.kill();
    } finally {
      trackedProcesses.delete(processId);
      notifyHealthSubscribers();
    }
  }

  static async stopAllProcesses(): Promise<void> {
    const entries = [...trackedProcesses.entries()];

    for (const [processId, process] of entries) {
      try {
        process.kill();
      } finally {
        trackedProcesses.delete(processId);
      }
    }
    notifyHealthSubscribers();
  }

  static getHealthSnapshot(): {
    generation: number;
    trackedProcessCount: number;
    recoveryCount: number;
    lastRecoveryAt: string | null;
    lastRecoveryReason: string | null;
  } {
    return {
      generation: runtimeHealth.generation,
      trackedProcessCount: trackedProcesses.size,
      recoveryCount: runtimeHealth.recoveryCount,
      lastRecoveryAt: runtimeHealth.lastRecoveryAt,
      lastRecoveryReason: runtimeHealth.lastRecoveryReason,
    };
  }

  static subscribeToHealth(callback: HealthSubscriber): () => void {
    healthSubscribers.add(callback);
    callback({ ...runtimeHealth, trackedProcessCount: trackedProcesses.size });
    return () => healthSubscribers.delete(callback);
  }

  static async reset(reason = "manual reset"): Promise<void> {
    await this.stopAllProcesses();
    writeQueue = Promise.resolve();
    runtimeHealth.generation += 1;
    runtimeHealth.lastRecoveryAt = new Date().toISOString();
    runtimeHealth.lastRecoveryReason = reason;
    notifyHealthSubscribers();
  }
}
