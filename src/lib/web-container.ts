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

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let terminalBootError: Error | null = null;
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
  ): Promise<T> {
    try {
      return await withTimeout(
        operation(),
        DEFAULT_OP_TIMEOUT_MS,
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
        DEFAULT_OP_TIMEOUT_MS,
        `${operationName} (retry)`,
      );
    }
  }

  static async getInstance(): Promise<WebContainer> {
    if (webcontainerInstance) {
      return webcontainerInstance;
    }

    if (terminalBootError) {
      throw terminalBootError;
    }

    if (bootPromise) {
      return bootPromise;
    }

    bootPromise = this.bootWithRetry();

    try {
      webcontainerInstance = await bootPromise;
      terminalBootError = null;
      return webcontainerInstance;
    } finally {
      bootPromise = null;
    }
  }

  private static async bootWithRetry(): Promise<WebContainer> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_BOOT_RETRIES; attempt += 1) {
      try {
        const instance = await WebContainer.boot();

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
      } catch (error) {
        lastError = error;
        if (isSingleInstanceBootError(error)) {
          terminalBootError = error instanceof Error
            ? error
            : new Error(getErrorMessage(error));
          throw terminalBootError;
        }
        if (attempt < MAX_BOOT_RETRIES) {
          await sleep(nextBackoff(attempt));
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to boot WebContainer");
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
    const process = await this.runWithRecovery(async () => {
      const instance = await this.getInstance();
      const spawnOpts =
        options.cwd || options.env
          ? { cwd: options.cwd, env: options.env }
          : undefined;
      return await instance.spawn(command, options.args ?? [], spawnOpts);
    }, `spawn ${command}`);

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
    webcontainerInstance = null;
    bootPromise = null;
    terminalBootError = null;
    writeQueue = Promise.resolve();
    runtimeHealth.generation += 1;
    runtimeHealth.lastRecoveryAt = new Date().toISOString();
    runtimeHealth.lastRecoveryReason = reason;
    notifyHealthSubscribers();
  }
}
