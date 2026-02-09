import { Sandbox } from "@vercel/sandbox";
import { PassThrough } from "node:stream";

/**
 * Executes a command in a secure Vercel Sandbox.
 * @param cmd The command to run (e.g., 'node')
 * @param args Arguments for the command
 * @param timeout Timeout in milliseconds (default 30s)
 */
export async function runInSandbox(cmd: string, args: string[] = [], timeout: number = 30000) {
    console.log(`[Sandbox] Creating sandbox for: ${cmd} ${args.join(' ')}`);

    // Ensure we have a sandbox instance
    let sandbox: Sandbox | null = null;

    try {
        sandbox = await Sandbox.create();

        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        let stdout = "";
        let stderr = "";

        stdoutStream.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        stderrStream.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        // Run the command with timeout protection
        await Promise.race([
            sandbox.runCommand({
                cmd,
                args,
                stdout: stdoutStream,
                stderr: stderrStream,
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Sandbox execution timed out after ${timeout}ms`)), timeout)
            )
        ]);

        return {
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            output: stdout.trim() || stderr.trim() || "(No output from sandbox)"
        };
    } catch (error: any) {
        console.error(`[Sandbox] Execution failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            stdout: "",
            stderr: "",
            output: `[Sandbox Error]: ${error.message}`
        };
    } finally {
        if (sandbox) {
            try {
                await sandbox.stop();
                console.log(`[Sandbox] Sandbox stopped successfully.`);
            } catch (stopError: any) {
                console.error(`[Sandbox] Failed to stop sandbox: ${stopError.message}`);
            }
        }
    }
}
