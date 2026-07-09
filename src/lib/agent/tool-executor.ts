/**
 * Server-only dispatch for a single agent tool call. Shared by:
 *   - engine.ts's `runAgent` loop (the cloud-model agent), and
 *   - /api/agent/local-tool (one call per invocation, driven by a model the
 *     user runs on their own machine — see local-agent.ts on the client).
 *
 * Every tool is scoped to `userId` via the VFS (vm-fs.ts), which itself scopes
 * every DB query to that user — there is no cross-user access path here as
 * long as callers pass the *session's* authenticated userId, never a
 * client-supplied one.
 */

import * as vfs from "./vm-fs";
import { currentRuntime } from "../runtime";
import { truncateMiddle } from "./context-budget";
import { isDestructiveCommand, splitCommand, type AgentToolName } from "./tool-protocol";

// Dynamic import of child_process to avoid CF Workers import failures.
let execFile: ((file: string, args?: ReadonlyArray<string> | null, options?: import("child_process").ExecFileOptions) => Promise<{ stdout: string; stderr: string }>) | null = null;
async function getExecFile() {
    if (execFile) return execFile;
    if (!currentRuntime.canExecuteCommands) return null;
    try {
        const { promisify } = await import("util");
        const { execFile: execFileCb } = await import("child_process");
        execFile = promisify(execFileCb);
        return execFile;
    } catch {
        return null;
    }
}

function normalizeRequested(requested: string): string {
    return requested.replace(/^\.?\/+/, "").replace(/\/+$/g, "").trim();
}

/**
 * Resolve a model-supplied path to a real file, or produce a helpful, agent-
 * readable error when it can't. On an exact miss we hand back a "did you mean"
 * list (or a hint to run list_files) rather than a dead end, so the model can
 * recover in the next turn instead of giving up.
 */
async function resolvePathOrError(
    userId: string,
    requested: string,
): Promise<{ path: string } | { error: string }> {
    if (!requested || !requested.trim()) {
        return { error: `[ERROR]: No file path given. Call list_files(".") to see the workspace, then retry.` };
    }
    let resolved: Awaited<ReturnType<typeof vfs.resolveFilePath>>;
    try {
        resolved = await vfs.resolveFilePath(userId, requested);
    } catch (e) {
        return { error: `[ERROR]: ${e instanceof Error ? e.message : "Could not resolve path."}` };
    }
    if (resolved.path) return { path: resolved.path };
    if (resolved.candidates.length > 0) {
        return {
            error: `[NOT_FOUND]: No exact match for "${requested}". Closest files — call the tool again with the full path:\n${resolved.candidates.join("\n")}`,
        };
    }
    return {
        error: `[NOT_FOUND]: "${requested}" is not in the workspace. Call list_files(".") to see the real paths, then retry.`,
    };
}

/** Remove accidental JSON-stringification some models produce for write_to_file content. */
function sanitizeContent(content: string): string {
    if (!content) return "";
    const clean = content.trim();
    if (clean.startsWith('"') && clean.endsWith('"') && clean.includes("\\n")) {
        try {
            const parsed = JSON.parse(clean);
            if (typeof parsed === "string") return parsed;
        } catch {
            return clean.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
    }
    return content;
}

export interface ExecuteToolParams {
    userId: string;
    cwd: string;
    toolName: AgentToolName;
    args: string[];
}

export interface ExecuteToolResult {
    result: string;
    /** Set when a file was created/modified, so the caller can emit a `file_created` event. */
    fileEvent?: { fileName: string; content: string };
}

export async function executeAgentTool({ userId, cwd, toolName, args }: ExecuteToolParams): Promise<ExecuteToolResult> {
    try {
        switch (toolName) {
            case "read_file": {
                const resolved = await resolvePathOrError(userId, args[0]);
                if ("error" in resolved) return { result: resolved.error };
                const content = await vfs.readFile(userId, resolved.path, cwd);
                const note = resolved.path !== normalizeRequested(args[0])
                    ? `[RESOLVED]: "${args[0]}" → ${resolved.path}\n`
                    : "";
                const result = `${note}[FILE_CONTENT: ${resolved.path}]:\n${truncateMiddle(content, 12_000)}${content.length > 12_000 ? "\n[NOTE]: File truncated. Use read_file_chunk for exact sections." : ""}`;
                return { result };
            }

            case "read_file_chunk": {
                const resolved = await resolvePathOrError(userId, args[0]);
                if ("error" in resolved) return { result: resolved.error };
                const start = parseInt(args[1]) || 0;
                const end = parseInt(args[2]) || 100;
                const content = await vfs.readFile(userId, resolved.path, cwd);
                const lines = content.split("\n");
                const chunk = lines.slice(start - 1, end).join("\n");
                return { result: `[FILE_CHUNK_LINES_${start}_TO_${end} of ${resolved.path}]:\n${truncateMiddle(chunk, 12_000)}` };
            }

            case "apply_patch": {
                const resolved = await resolvePathOrError(userId, args[0]);
                if ("error" in resolved) return { result: resolved.error };
                const filePath = resolved.path;
                const snippet = args[1];
                const originalContent = await vfs.readFile(userId, filePath, cwd);

                const { applyPatch } = await import("../code-patcher");
                const patchResult = applyPatch(originalContent, snippet);

                if (patchResult.success && patchResult.patchedCode) {
                    const saveResult = await vfs.writeFile(userId, filePath, patchResult.patchedCode);
                    if (saveResult.success) {
                        return {
                            result: `[SUCCESS]: Patched ${filePath} using ${patchResult.method} method and saved to the project.`,
                            fileEvent: { fileName: filePath, content: patchResult.patchedCode },
                        };
                    }
                    return { result: `[ERROR]: Failed to save patched file: ${saveResult.error || "Unknown error"}` };
                }
                return { result: `[ERROR]: Patch failed. Ensure snippet matches original code exactly.` };
            }

            case "write_to_file": {
                const filePath = args[0];
                const content = sanitizeContent(args[1]);
                const writeResult = await vfs.writeFile(userId, filePath, content);

                if (writeResult.success) {
                    return {
                        result: `[SUCCESS]: Wrote ${content.length} characters to ${filePath} (Workspace Storage)`,
                        fileEvent: { fileName: filePath, content },
                    };
                }
                return { result: `[ERROR]: Failed to write file: ${writeResult.error || "Unknown error"}` };
            }

            case "list_files": {
                const dir = args[0] || ".";
                const files = await vfs.listFiles(userId, dir, cwd);
                if (files.length > 0) {
                    return { result: `[FILES under ${dir}]:\n${files.join("\n")}` };
                }
                // Empty usually means the directory name is wrong — show the whole
                // workspace so the model can correct itself instead of retrying blind.
                const all = await vfs.listFiles(userId, ".", cwd);
                return {
                    result: `[FILES]: nothing under "${dir}". Full workspace (${all.length} files):\n${all.slice(0, 200).join("\n")}`,
                };
            }

            case "execute_command": {
                const cmd = args[0];
                if (isDestructiveCommand(cmd)) {
                    return { result: `[ERROR]: Command blocked for safety.` };
                }
                if (!currentRuntime.canExecuteCommands && !currentRuntime.canUseSandbox) {
                    return { result: `[ERROR]: Command execution is disabled in the current runtime (${currentRuntime.runtimeName}). Use VFS or storage APIs instead.` };
                }

                if (currentRuntime.canUseSandbox) {
                    try {
                        const { runInSandbox } = await import("../sandbox");
                        const parts = splitCommand(cmd);
                        const sandboxRes = await runInSandbox(parts[0], parts.slice(1));
                        if (sandboxRes.success) {
                            const out = sandboxRes.stdout ? truncateMiddle(sandboxRes.stdout, 20_000) : "(no output)";
                            let result = `[SANDBOX_STDOUT]:\n${out}`;
                            if (sandboxRes.stderr) result += `\n[SANDBOX_STDERR]:\n${truncateMiddle(sandboxRes.stderr, 12_000)}`;
                            return { result };
                        }
                        return { result: `[SANDBOX_ERROR]:\n${sandboxRes.error}` };
                    } catch (e: unknown) {
                        return { result: `[SANDBOX_EXCEPTION]: ${e instanceof Error ? e.message : String(e)}` };
                    }
                }

                if (currentRuntime.canExecuteCommands) {
                    const execFn = await getExecFile();
                    if (!execFn) return { result: `[ERROR]: Command execution unavailable in this runtime.` };
                    const parts = splitCommand(cmd);
                    const { stdout, stderr } = await execFn(parts[0], parts.slice(1), { cwd, timeout: 10000 });
                    return { result: `[STDOUT]:\n${truncateMiddle(stdout, 20_000)}\n[STDERR]:\n${truncateMiddle(stderr, 12_000)}` };
                }

                return { result: `[ERROR]: Execution path blocked.` };
            }

            case "search_files": {
                const pattern = args[0] || "";
                const results = await vfs.searchByName(userId, pattern);
                return { result: `[RESULTS]:\n${results.length ? results.join("\n") : "None found."}` };
            }

            case "grep_search": {
                const query = args[0] || "";
                const results = await vfs.grepContent(userId, query);
                return { result: `[RESULTS]:\n${results.length ? results.join("\n") : "None found."}` };
            }

            default:
                return { result: `[ERROR]: Tool '${toolName}' not found.` };
        }
    } catch (e: unknown) {
        return { result: `[EXCEPTION]: ${e instanceof Error ? e.message : String(e)}` };
    }
}
