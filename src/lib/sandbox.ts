// @ts-ignore
import type { Sandbox } from "@vercel/sandbox";
import { PassThrough } from "node:stream";
import { currentRuntime } from "./runtime";

// We dynamically import Sandbox to avoid issues in Edge environment if it's not present
let SandboxClass: any = null;
if (currentRuntime.canUseSandbox) {
    try {
        SandboxClass = require("@vercel/sandbox").Sandbox;
    } catch (e) {
        console.warn("Vercel Sandbox module not found, execution might fail.");
    }
}

export interface SandboxResult {
    success: boolean;
    stdout: string;
    stderr: string;
    output: string;
    error?: string;
}

/**
 * Handles a multi-step sandbox session (write files, run commands)
 */
export class SandboxSession {
    private sandbox: Sandbox | null = null;
    private logs: string[] = [];
    private onLogCallback?: (msg: string) => void;

    constructor(onLog?: (msg: string) => void) {
        this.onLogCallback = onLog;
    }

    private log(msg: string) {
        this.logs.push(msg);
        if (this.onLogCallback) {
            this.onLogCallback(msg);
        }
    }

    async init() {
        if (!currentRuntime.canUseSandbox || !SandboxClass) {
            this.log("[Sandbox] Disabled in current runtime. Skipping initialization.");
            return;
        }
        this.sandbox = await SandboxClass.create();
        this.log("[Sandbox] Session initialized.");
    }

    async writeFile(path: string, content: string) {
        if (!currentRuntime.canUseSandbox) {
            this.log("[Sandbox] Disabled. Cannot write file.");
            return;
        }
        if (!this.sandbox) throw new Error("Sandbox not initialized");
        // Ensure path starts with /vercel/sandbox as per docs if needed, 
        // but often relative to CWD works. Let's assume relative to root of sandbox.
        await (this.sandbox as any).writeFile(path, content);
    }

    async runCommand(cmd: string, args: string[] = [], timeout: number = 60000): Promise<SandboxResult> {
        if (!currentRuntime.canUseSandbox) {
            this.log("[Sandbox] Disabled. Cannot run command.");
            return {
                success: false,
                stdout: "",
                stderr: "",
                output: "[Sandbox] Command execution is disabled in the current runtime.",
                error: "Execution disabled",
            };
        }
        if (!this.sandbox) throw new Error("Sandbox not initialized");

        this.log(`[Sandbox] Running: ${cmd} ${args.join(' ')}`);

        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        let stdout = "";
        let stderr = "";

        stdoutStream.on("data", (chunk) => {
            const data = chunk.toString();
            stdout += data;
            this.log(data);
        });

        stderrStream.on("data", (chunk) => {
            const data = chunk.toString();
            stderr += data;
            this.log(data);
        });

        try {
            await Promise.race([
                this.sandbox.runCommand({
                    cmd,
                    args,
                    stdout: stdoutStream,
                    stderr: stderrStream,
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout)
                )
            ]);

            return {
                success: true,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                output: stdout.trim() || stderr.trim() || "(No output)"
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(`[Sandbox] Error: ${message}`);
            return {
                success: false,
                error: message,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                output: `[Error]: ${message}`
            };
        }
    }

    async stop() {
        if (this.sandbox) {
            await this.sandbox.stop();
            this.log("[Sandbox] Session stopped.");
            this.sandbox = null;
        }
    }

    getLogs() {
        return this.logs.join("");
    }
}

/**
 * Legacy helper for one-off commands
 */
export async function runInSandbox(cmd: string, args: string[] = [], timeout: number = 30000) {
    const session = new SandboxSession();
    try {
        await session.init();
        const result = await session.runCommand(cmd, args, timeout);
        return result;
    } finally {
        await session.stop();
    }
}
