import type { Writable } from "node:stream";

/**
 * Provider-agnostic sandbox interface.
 *
 * This is the seam that lets DocuMint run user/agent code on any host. It is
 * modelled on the surface of `@vercel/sandbox` that the app already uses, so the
 * Vercel adapter is a thin pass-through and the in-container executor
 * (LocalSandbox, for Railway/self-hosted) is a drop-in replacement.
 *
 * Consumers (to be migrated in the integration step):
 *   - src/lib/agent/agent-sandbox.ts   (agent execute_command + dev-server preview)
 *   - src/app/api/ide/sandbox/run/route.ts  (run Python/Go/… in the IDE)
 *   - src/lib/sandbox.ts               (legacy one-off command helper)
 */

export type SandboxRuntimeName = "node24" | "python3.13" | (string & {});

export interface SandboxCreateOptions {
    /**
     * Which base runtime the sandbox should provide. The Vercel provider uses
     * this to pick a VM image; the in-container executor ignores it (every
     * language runtime lives in the one Railway image) but accepts it for
     * signature parity.
     */
    runtime?: SandboxRuntimeName;
    /** Sandbox/workspace lifetime in ms. After this it is reaped. */
    timeout?: number;
    /** Ports the sandbox intends to expose (e.g. a dev server's port). */
    ports?: number[];
    /** Owning user, for scoping/quotas/cleanup. Optional. */
    userId?: string;
}

export interface RunCommandOptions {
    cmd: string;
    args?: string[];
    /** Working directory, sandbox-relative or absolute-within-sandbox. */
    cwd?: string;
    /**
     * Extra environment for the command. NOTE: the in-container executor starts
     * from an EMPTY, secret-free base env and merges only what is passed here —
     * the app's own secrets are never inherited by user code.
     */
    env?: Record<string, string>;
    /** Start the process and return immediately (dev servers). */
    detached?: boolean;
    /** Live stream stdout here (in addition to buffering). */
    stdout?: Writable;
    /** Live stream stderr here (in addition to buffering). */
    stderr?: Writable;
    /** Hard timeout for a non-detached command, in ms. Omit to let the caller race its own timeout. */
    timeoutMs?: number;
}

export interface CommandHandle {
    /** Stable id for the spawned command (parity with @vercel/sandbox). */
    cmdId: string;
    /** Exit code once the command has finished; `undefined` while a detached command is still running. */
    exitCode?: number;
    /** Resolves with the command's buffered stdout once it has finished. */
    stdout(): Promise<string>;
    /** Resolves with the command's buffered stderr once it has finished. */
    stderr(): Promise<string>;
}

export interface WriteFileInput {
    path: string;
    content: Buffer;
}

export interface Sandbox {
    readonly sandboxId: string;
    /** Write a batch of files into the sandbox workspace. */
    writeFiles(files: WriteFileInput[]): Promise<void>;
    /** Convenience single-file write (used by the legacy one-off helper). */
    writeFile(path: string, content: string | Buffer): Promise<void>;
    /** Read a file back out of the workspace, or `null` if it does not exist. */
    readFileToBuffer(file: { path: string; cwd?: string }): Promise<Buffer | null>;
    /** Run a command. See RunCommandOptions for streaming/detached semantics. */
    runCommand(options: RunCommandOptions): Promise<CommandHandle>;
    /** Public URL for a port the sandbox exposes (a dev-server preview). */
    domain(port: number): string;
    /**
     * Reserve a usable port for a dev server. In-container sandboxes share one
     * network namespace, so a free loopback port must be allocated to avoid
     * collisions between concurrent runs; hosted per-VM sandboxes don't need
     * this and omit it (callers fall back to their preferred port).
     */
    allocatePort?(): Promise<number>;
    /**
     * A URL the server can `fetch()` directly to check a dev server is up.
     * Loopback for in-container sandboxes; omitted for hosted sandboxes, where
     * callers fall back to {@link domain}.
     */
    probeUrl?(port: number): string;
    /** Terminate all processes and delete the workspace. Idempotent. */
    stop(): Promise<void>;
}

export type SandboxProviderName = "vercel" | "local" | "none";
