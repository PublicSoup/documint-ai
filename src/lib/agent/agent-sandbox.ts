import { db } from "../db";

/**
 * Workspace-seeded Vercel Sandbox for the IDE agent.
 *
 * The plain `runInSandbox` helper boots an EMPTY VM per command, so every
 * `npm install` / `ls src` the agent tried failed with ENOENT and the agent
 * spiralled. This wrapper gives one sandbox per agent run that:
 *
 *  - is seeded with the user's real project files (from the DB workspace),
 *  - persists across commands in the run (npm install → npm run build works),
 *  - tracks `cd` so compound commands behave like a real shell,
 *  - can start a dev server detached and expose a public preview URL,
 *  - syncs files the tooling creates (scaffolds, lockfiles) back to the
 *    workspace so nothing the agent produces is lost when the VM expires.
 *
 * All @vercel/sandbox access is via dynamic import (CF Workers safety).
 */

const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000; // VM lifetime (also preview lifetime)
const DEFAULT_CMD_TIMEOUT_MS = 90_000;
const INSTALL_CMD_TIMEOUT_MS = 240_000;
const PREVIEW_WAIT_MS = 45_000;
const MAX_SEED_FILES = 800;
const MAX_SEED_FILE_BYTES = 1_000_000;
const MAX_SYNC_BACK_FILES = 30;
const MAX_SYNC_BACK_BYTES = 500_000;
const SEED_STAMP = ".agent-seed-stamp";
const PREVIEW_PORTS = [3000, 5173];

const SYNC_EXCLUDES = ["node_modules", ".git", "dist", "build", ".next", ".cache", "coverage", ".npm"];

export interface SandboxExecResult {
    ok: boolean;
    exitCode?: number;
    stdout: string;
    stderr: string;
    error?: string;
}

export interface PreviewResult {
    ok: boolean;
    url?: string;
    port?: number;
    logTail?: string;
    error?: string;
}

export interface SyncedFile {
    path: string;
    content: string;
}

type SandboxInstance = {
    sandboxId: string;
    writeFiles(files: { path: string; content: Buffer }[]): Promise<void>;
    readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null>;
    runCommand(params: {
        cmd: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        detached?: boolean;
        stdout?: NodeJS.WritableStream;
        stderr?: NodeJS.WritableStream;
    }): Promise<{ exitCode?: number } | unknown>;
    domain(port: number): string;
    stop(): Promise<unknown>;
};

async function loadSandboxClass(): Promise<{ create(params: Record<string, unknown>): Promise<SandboxInstance> } | null> {
    try {
        const mod = await import("@vercel/sandbox");
        return mod.Sandbox as unknown as { create(params: Record<string, unknown>): Promise<SandboxInstance> };
    } catch {
        return null;
    }
}

function isProbablyBinary(content: string): boolean {
    return content.includes("\u0000");
}

const SANDBOX_HOME = "/vercel/sandbox";

/** The sandbox API 400s on relative cwd values — always send absolute paths. */
function toSandboxCwd(cwd: string | undefined): string | undefined {
    if (!cwd || cwd === ".") return undefined;
    return cwd.startsWith("/") ? cwd : `${SANDBOX_HOME}/${cwd}`;
}

export class AgentSandbox {
    private sandbox: SandboxInstance | null = null;
    private seedError: string | null = null;
    private seededFileCount = 0;
    private previewStarted = false;
    private lastCwd = ".";

    get isActive(): boolean {
        return this.sandbox !== null;
    }

    get currentCwd(): string {
        return this.lastCwd;
    }

    set currentCwd(dir: string) {
        this.lastCwd = dir || ".";
    }

    /** Boot the VM and copy the user's workspace into it (lazy, once per run). */
    async ensureSeeded(userId: string): Promise<{ ok: boolean; fileCount: number; error?: string }> {
        if (this.sandbox) return { ok: true, fileCount: this.seededFileCount };
        if (this.seedError) return { ok: false, fileCount: 0, error: this.seedError };

        const SandboxClass = await loadSandboxClass();
        if (!SandboxClass) {
            this.seedError = "Sandbox module unavailable in this runtime.";
            return { ok: false, fileCount: 0, error: this.seedError };
        }

        try {
            const files: { name: string; content: string | null }[] = await db.file.findMany({
                where: { userId },
                select: { name: true, content: true },
                orderBy: { name: "asc" },
                take: MAX_SEED_FILES,
            });

            const sandbox = await SandboxClass.create({
                runtime: "node24",
                timeout: SANDBOX_TIMEOUT_MS,
                ports: PREVIEW_PORTS,
            });

            const seedable = files
                .filter((file) => typeof file.content === "string" && !isProbablyBinary(file.content))
                .map((file) => ({ path: file.name, content: Buffer.from(file.content as string, "utf8") }))
                .filter((file) => file.content.byteLength <= MAX_SEED_FILE_BYTES);

            // Stamp first so `find -newer` later only reports files created by commands.
            const payload = [...seedable, { path: SEED_STAMP, content: Buffer.from(String(Date.now()), "utf8") }];
            for (let i = 0; i < payload.length; i += 60) {
                await sandbox.writeFiles(payload.slice(i, i + 60));
            }

            this.sandbox = sandbox;
            this.seededFileCount = seedable.length;
            return { ok: true, fileCount: seedable.length };
        } catch (error: unknown) {
            this.seedError = error instanceof Error ? error.message : String(error);
            return { ok: false, fileCount: 0, error: this.seedError };
        }
    }

    /** Run one command to completion, capturing output and the real exit code. */
    async exec(
        cmd: string,
        args: string[],
        options: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
    ): Promise<SandboxExecResult> {
        if (!this.sandbox) return { ok: false, stdout: "", stderr: "", error: "Sandbox not initialized" };

        const { PassThrough } = await import("node:stream");
        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();
        let stdout = "";
        let stderr = "";
        stdoutStream.on("data", (chunk) => { stdout += chunk.toString(); });
        stderrStream.on("data", (chunk) => { stderr += chunk.toString(); });
        // Stream teardown races (sandbox stopping) must never crash the process.
        stdoutStream.on("error", () => undefined);
        stderrStream.on("error", () => undefined);

        const timeoutMs = options.timeoutMs
            ?? (/^(npm|pnpm|yarn|npx)$/.test(cmd) ? INSTALL_CMD_TIMEOUT_MS : DEFAULT_CMD_TIMEOUT_MS);

        try {
            const finished = await Promise.race([
                this.sandbox.runCommand({
                    cmd,
                    args,
                    cwd: toSandboxCwd(options.cwd),
                    env: options.env,
                    stdout: stdoutStream,
                    stderr: stderrStream,
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs),
                ),
            ]);

            const exitCode = (finished as { exitCode?: number })?.exitCode;
            return {
                ok: exitCode === undefined || exitCode === 0,
                exitCode,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
            };
        } catch (error: unknown) {
            return {
                ok: false,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Start a dev server detached and wait for it to answer on its public URL.
     * Framework detection favours explicit host/port flags so the server binds
     * 0.0.0.0 on a port the sandbox actually exposes.
     */
    async startDevServer(userId: string, cwd: string): Promise<PreviewResult> {
        if (!this.sandbox) return { ok: false, error: "Sandbox not initialized" };

        const pkg = await this.readProjectPackageJson(userId, cwd);
        let cmd = "npm";
        let args: string[] = ["run", "dev"];
        let port = 3000;

        const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
        if (deps.vite) {
            cmd = "npx";
            args = ["vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"];
            port = 5173;
        } else if (deps.next) {
            cmd = "npx";
            args = ["next", "dev", "-H", "0.0.0.0", "-p", "3000"];
            port = 3000;
        }

        const { PassThrough } = await import("node:stream");
        const logStream = new PassThrough();
        let logTail = "";
        logStream.on("data", (chunk) => {
            logTail = (logTail + chunk.toString()).slice(-2_000);
        });
        // The detached server's log pipe errors when the VM later stops — ignore.
        logStream.on("error", () => undefined);

        try {
            // The public domain is deterministic — compute it up front so the
            // dev server can allowlist its own host (Vite 6 blocks unknown
            // Host headers unless the host is explicitly allowed).
            const url = this.sandbox.domain(port);
            const publicHost = new URL(url).host;

            await this.sandbox.runCommand({
                cmd,
                args,
                cwd: toSandboxCwd(cwd),
                env: {
                    HOST: "0.0.0.0",
                    PORT: String(port),
                    __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: publicHost,
                },
                detached: true,
                stdout: logStream,
                stderr: logStream,
            });
            const deadline = Date.now() + PREVIEW_WAIT_MS;
            while (Date.now() < deadline) {
                try {
                    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
                    if (res.status < 500) {
                        this.previewStarted = true;
                        return { ok: true, url, port, logTail };
                    }
                } catch {
                    // Server not up yet — keep polling.
                }
                await new Promise((resolve) => setTimeout(resolve, 1_500));
            }
            return { ok: false, url, port, logTail, error: `Dev server did not respond within ${PREVIEW_WAIT_MS / 1000}s` };
        } catch (error: unknown) {
            return { ok: false, logTail, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * Pull files that sandbox commands created/changed (scaffolds, lockfiles)
     * back into the workspace store so they survive the VM.
     */
    async collectChangedFiles(): Promise<SyncedFile[]> {
        if (!this.sandbox) return [];

        // -prune stops find from DESCENDING into heavy dirs (node_modules can be
        // tens of thousands of files after npm install — merely filtering with
        // -not -path still walks them all and times out).
        const pruneExpr = SYNC_EXCLUDES.flatMap((dir, index) => (index === 0 ? ["-name", dir] : ["-o", "-name", dir]));
        const found = await this.exec("find", [
            ".", "(", ...pruneExpr, ")", "-prune",
            "-o", "-type", "f", "-newer", SEED_STAMP,
            "-not", "-name", SEED_STAMP,
            "-size", `-${Math.floor(MAX_SYNC_BACK_BYTES / 1024)}k`,
            "-print",
        ], { cwd: ".", timeoutMs: 60_000 });

        // find exits non-zero on traversal warnings while still printing results,
        // so trust stdout when present.
        if (!found.stdout) return [];

        const paths = found.stdout
            .split("\n")
            .map((line) => line.trim().replace(/^\.\//, ""))
            .filter(Boolean)
            .slice(0, MAX_SYNC_BACK_FILES);

        const synced: SyncedFile[] = [];
        for (const path of paths) {
            try {
                const buffer = await this.sandbox.readFileToBuffer({ path });
                if (!buffer || buffer.byteLength > MAX_SYNC_BACK_BYTES) continue;
                const content = buffer.toString("utf8");
                if (!isProbablyBinary(content)) {
                    synced.push({ path, content });
                }
            } catch {
                // Unreadable file — skip it.
            }
        }

        // Refresh the stamp so the next collection only sees newer changes.
        try {
            await this.sandbox.writeFiles([{ path: SEED_STAMP, content: Buffer.from(String(Date.now()), "utf8") }]);
        } catch {
            // Non-fatal.
        }
        return synced;
    }

    /** Stop the VM unless a preview server needs it alive (the timeout reaps it). */
    async dispose(force = false): Promise<void> {
        if (!this.sandbox) return;
        if (force || !this.previewStarted) {
            try {
                await this.sandbox.stop();
            } catch {
                // Already stopping/stopped.
            }
        }
        this.sandbox = null;
    }

    private async readProjectPackageJson(
        userId: string,
        cwd: string,
    ): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } | null> {
        const path = cwd && cwd !== "." ? `${cwd.replace(/\/+$/, "")}/package.json` : "package.json";
        try {
            const file = await db.file.findFirst({
                where: { userId, name: path },
                orderBy: { updatedAt: "desc" },
                select: { content: true },
            });
            if (file?.content) return JSON.parse(file.content);
            if (this.sandbox) {
                const fromSandbox = await this.sandbox.readFileToBuffer({ path });
                if (fromSandbox) return JSON.parse(fromSandbox.toString("utf8"));
            }
            return null;
        } catch {
            return null;
        }
    }
}

/** Folders (or ".") that contain a package.json — the runnable project roots. */
export function detectProjectRoots(fileNames: string[]): string[] {
    const roots = new Set<string>();
    for (const name of fileNames) {
        if (name === "package.json") roots.add(".");
        else if (name.endsWith("/package.json") && !name.includes("node_modules")) {
            roots.add(name.slice(0, -"/package.json".length));
        }
    }
    return [...roots].sort();
}
