import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { registerSandbox, unregisterSandbox } from "./registry";
import type {
    CommandHandle,
    RunCommandOptions,
    Sandbox,
    SandboxCreateOptions,
    WriteFileInput,
} from "./types";

/**
 * In-container sandbox: runs user/agent code with `child_process` inside the
 * app container (Railway / any self-hosted Node server). Each sandbox is one
 * temp workspace under {@link SANDBOX_PARENT_DIR}, seeded by the caller and
 * torn down on stop or expiry.
 *
 * This is NOT VM isolation — processes share the container's kernel and user.
 * The safety model is: (1) a secret-free child environment (the app's own env
 * is never inherited), (2) path confinement to the workspace root, (3) no shell
 * (argv is passed literally), plus caller-side command allow-listing, output
 * caps and timeouts, and the reaper. See plans/railway-migration.md (WS-7).
 */

const SANDBOX_PARENT_DIR = join(tmpdir(), "documint-sandboxes");
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
/** Per-stream buffer ceiling, so a chatty command can't exhaust memory. */
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;
/** How long to wait after SIGTERM before SIGKILL when stopping a process. */
const KILL_GRACE_MS = 3_000;
/** Legacy Vercel Sandbox home; callers may still send `/vercel/sandbox/...` paths. */
const LEGACY_HOME_PREFIX = "/vercel/sandbox";

function appBaseUrl(): string {
    const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    return raw.replace(/\/+$/, "");
}

/**
 * Build a minimal, SECRET-FREE environment for untrusted code.
 *
 * We deliberately do NOT spread `process.env` — that would hand DATABASE_URL,
 * Stripe keys, NEXTAUTH_SECRET, ENCRYPTION_KEY, etc. to code running in the
 * same container. Start from a safe base and merge only the caller's explicit
 * env; because the base is empty of secrets, the caller can never re-introduce
 * one by accident.
 */
function buildChildEnv(root: string, userEnv?: Record<string, string>): NodeJS.ProcessEnv {
    const base: Record<string, string> = {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: root,
        TMPDIR: root,
        LANG: process.env.LANG ?? "C.UTF-8",
        LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
        // User projects generally expect dev defaults and quiet npm.
        NODE_ENV: "development",
        CI: "1",
        npm_config_update_notifier: "false",
        npm_config_fund: "false",
        npm_config_audit: "false",
    };
    // Cast: spreading the caller's Record<string,string> widens NODE_ENV back to
    // `string`, which no longer matches ProcessEnv's augmented literal union.
    return { ...base, ...(userEnv ?? {}) } as NodeJS.ProcessEnv;
}

export class LocalSandbox implements Sandbox {
    readonly sandboxId: string;
    private readonly root: string;
    private readonly expiresAt: number;
    private readonly processes = new Set<ChildProcess>();
    private previewPortValue: number | undefined;
    private disposed = false;

    private constructor(root: string, id: string, options: SandboxCreateOptions) {
        this.root = root;
        this.sandboxId = id;
        this.expiresAt = Date.now() + (options.timeout ?? DEFAULT_TIMEOUT_MS);
        this.previewPortValue = options.ports?.[0];
    }

    static async create(options: SandboxCreateOptions = {}): Promise<LocalSandbox> {
        // The id doubles as the unguessable capability token in the preview
        // proxy URL, so it must be hard to brute-force (not just a temp-dir suffix).
        const id = `sb-${randomUUID()}`;
        const root = join(SANDBOX_PARENT_DIR, id);
        await mkdir(root, { recursive: true });
        const sandbox = new LocalSandbox(root, id, options);
        registerSandbox(sandbox);
        return sandbox;
    }

    /** The port a detached dev server is (or will be) listening on, if any. */
    get previewPort(): number | undefined {
        return this.previewPortValue;
    }

    isExpired(now: number = Date.now()): boolean {
        return now >= this.expiresAt;
    }

    /** Reserve a free ephemeral port on loopback and remember it as the preview port. */
    async allocatePort(): Promise<number> {
        const port = await new Promise<number>((resolvePort, rejectPort) => {
            const server = createServer();
            server.once("error", rejectPort);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address();
                const chosen = typeof address === "object" && address ? address.port : 0;
                server.close(() => resolvePort(chosen));
            });
        });
        this.previewPortValue = port;
        return port;
    }

    async writeFiles(files: WriteFileInput[]): Promise<void> {
        this.assertActive();
        for (const file of files) {
            const absolutePath = this.toWorkspacePath(file.path);
            await mkdir(dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, file.content);
        }
    }

    async writeFile(path: string, content: string | Buffer): Promise<void> {
        await this.writeFiles([
            { path, content: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8") },
        ]);
    }

    async readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null> {
        this.assertActive();
        try {
            return await readFile(this.toWorkspacePath(file.path, file.cwd));
        } catch {
            return null;
        }
    }

    async runCommand(options: RunCommandOptions): Promise<CommandHandle> {
        this.assertActive();

        const cmdId = randomUUID();
        const cwd = this.toWorkspacePath(options.cwd ?? ".");
        // `shell: false` (the default) means argv is passed literally — no shell
        // interpolation, so callers must pass a real binary + args (the agent's
        // command planner already splits into that form).
        const child = spawn(options.cmd, options.args ?? [], {
            cwd,
            env: buildChildEnv(this.root, options.env),
            stdio: ["ignore", "pipe", "pipe"],
        });
        this.processes.add(child);

        let stdout = "";
        let stderr = "";
        const append = (buffer: string, chunk: Buffer): string =>
            buffer.length >= MAX_BUFFER_BYTES ? buffer : buffer + chunk.toString("utf8");

        child.stdout?.on("data", (chunk: Buffer) => {
            stdout = append(stdout, chunk);
            options.stdout?.write(chunk);
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            stderr = append(stderr, chunk);
            options.stderr?.write(chunk);
        });

        const finished = new Promise<number | undefined>((resolveExit) => {
            child.once("exit", (code) => {
                this.processes.delete(child);
                resolveExit(code ?? undefined);
            });
            child.once("error", (error) => {
                this.processes.delete(child);
                stderr = append(stderr, Buffer.from(`\n[spawn error]: ${String(error)}`));
                resolveExit(undefined);
            });
        });

        const handle: CommandHandle = {
            cmdId,
            exitCode: undefined,
            stdout: async () => {
                await finished;
                return stdout;
            },
            stderr: async () => {
                await finished;
                return stderr;
            },
        };

        // Detached (dev server): return now; record the port the caller told the
        // server to bind so the preview proxy can find it.
        if (options.detached) {
            const declaredPort = Number(options.env?.PORT);
            if (Number.isInteger(declaredPort) && declaredPort > 0) this.previewPortValue = declaredPort;
            void finished.then((code) => {
                handle.exitCode = code;
            });
            return handle;
        }

        const code = options.timeoutMs
            ? await this.raceWithTimeout(finished, child, options.timeoutMs, options.cmd)
            : await finished;
        handle.exitCode = code;
        return handle;
    }

    domain(port: number): string {
        // In-container dev servers are reachable only inside the container, so
        // previews are served same-origin through the app's preview proxy
        // (/api/preview/[sandboxId]/[port]/...) rather than a per-sandbox host.
        return `${appBaseUrl()}/api/preview/${this.sandboxId}/${port}/`;
    }

    probeUrl(port: number): string {
        // The app polls the dev server directly on loopback for readiness — no
        // dependence on the public proxy, and no Vite host-check to trip.
        return `http://127.0.0.1:${port}/`;
    }

    async stop(): Promise<void> {
        if (this.disposed) return;
        this.disposed = true;
        unregisterSandbox(this.sandboxId);
        for (const child of this.processes) this.killChild(child);
        this.processes.clear();
        try {
            await rm(this.root, { recursive: true, force: true });
        } catch {
            // Best-effort cleanup; the reaper / container restart is the backstop.
        }
    }

    private async raceWithTimeout(
        finished: Promise<number | undefined>,
        child: ChildProcess,
        timeoutMs: number,
        cmd: string,
    ): Promise<number | undefined> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                this.killChild(child);
                reject(new Error(`Command "${cmd}" timed out after ${Math.round(timeoutMs / 1000)}s`));
            }, timeoutMs);
        });
        try {
            return await Promise.race([finished, timeout]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    private killChild(child: ChildProcess): void {
        try {
            child.kill("SIGTERM");
            const escalation = setTimeout(() => {
                try {
                    if (!child.killed) child.kill("SIGKILL");
                } catch {
                    // Already gone.
                }
            }, KILL_GRACE_MS);
            escalation.unref?.();
        } catch {
            // Process already exited.
        }
    }

    /**
     * Map a caller path to an absolute path INSIDE the workspace root.
     * Accepts workspace-relative paths, absolute paths already under root, and
     * legacy `/vercel/sandbox/...` paths. Throws if the result escapes root.
     */
    private toWorkspacePath(inputPath: string, cwd?: string): string {
        const raw = inputPath && inputPath.trim() ? inputPath : ".";
        let relativePath = raw;

        if (isAbsolute(raw)) {
            if (raw === this.root || raw.startsWith(this.root + sep)) {
                relativePath = relative(this.root, raw) || ".";
            } else if (raw === LEGACY_HOME_PREFIX || raw.startsWith(`${LEGACY_HOME_PREFIX}/`)) {
                relativePath = raw.slice(LEGACY_HOME_PREFIX.length).replace(/^\/+/, "") || ".";
            } else {
                // Some other absolute path — treat everything after the leading
                // slash as workspace-relative rather than trusting it.
                relativePath = raw.replace(/^\/+/, "");
            }
        }

        const base = cwd ? this.toWorkspacePath(cwd) : this.root;
        const absolutePath = resolve(base, relativePath);
        if (absolutePath !== this.root && !absolutePath.startsWith(this.root + sep)) {
            throw new Error(`Path escapes sandbox root: ${inputPath}`);
        }
        return absolutePath;
    }

    private assertActive(): void {
        if (this.disposed) throw new Error(`Sandbox ${this.sandboxId} has been stopped`);
    }
}
