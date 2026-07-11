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
import { COMMAND_RULES, parseCommandPlan, splitCommand, type AgentToolName, type CommandSegment } from "./tool-protocol";
import type { AgentSandbox } from "./agent-sandbox";
import type { AgentEvent } from "./events";

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
    /**
     * Workspace-seeded sandbox for this agent run (engine.ts provides one).
     * When present, execute_command runs against a real VM copy of the
     * project — npm install/build work, dev servers get public preview URLs.
     * Callers without one (the local-tool route) get the VFS/legacy behavior.
     */
    sandbox?: AgentSandbox;
}

export interface ExecuteToolResult {
    result: string;
    /** Set when a file was created/modified, so the caller can emit a `file_created` event. */
    fileEvent?: { fileName: string; content: string };
    /** Extra events produced by the tool (preview_ready, sync-back file_created, progress). */
    events?: AgentEvent[];
}

/** Format "did you mean" suggestions when a project path doesn't exist. */
async function suggestClosestPaths(userId: string, wanted: string): Promise<string> {
    try {
        const files = await vfs.listFiles(userId, ".", "");
        const base = (wanted.split("/").pop() || wanted).toLowerCase();
        const stem = base.replace(/\.[^.]+$/, "");
        const close = files.filter((f) => {
            const lower = f.toLowerCase();
            return lower.includes(base) || (stem.length >= 3 && lower.includes(stem));
        }).slice(0, 5);
        const shown = close.length ? close : files.slice(0, 12);
        if (!shown.length) return " The workspace has no files yet — create one with write_to_file.";
        return close.length
            ? `\nClosest matches:\n${shown.join("\n")}`
            : `\nWorkspace files include:\n${shown.join("\n")}`;
    } catch {
        return "";
    }
}

/**
 * Serve file-inspection shell commands (cat/ls/grep/...) straight from the
 * user's project workspace. Used while no seeded sandbox is live (VM boots
 * cost time/money, and the plain runtime sandbox is an EMPTY VM without the
 * project files — the historic cause of agents spiralling on ENOENT).
 * Returns null for commands that need a real shell.
 */
async function tryVfsCommand(userId: string, cmd: string): Promise<string | null> {
    const parts = splitCommand(cmd.trim());
    if (parts.length === 0) return null;
    const bin = parts[0];
    const rest = parts.slice(1);
    const positional = rest.filter((token) => !token.startsWith("-"));
    const readTarget = positional[0];

    try {
        switch (bin) {
            case "pwd":
                return `[WORKSPACE]: / (virtual project root — reference files by relative path, e.g. src/App.tsx)`;

            case "ls":
            case "tree": {
                const dir = readTarget || ".";
                const files = await vfs.listFiles(userId, dir, "");
                if (!files.length) {
                    return `[WORKSPACE ${bin}]: No files found under '${dir}'.${await suggestClosestPaths(userId, dir)}`;
                }
                return `[WORKSPACE ${bin} ${dir}]:\n${files.join("\n")}`;
            }

            case "cat": {
                if (!readTarget) return `[ERROR]: cat requires a file path.`;
                const content = await vfs.readFile(userId, readTarget, "");
                return `[WORKSPACE cat ${readTarget}]:\n${truncateMiddle(content, 12_000)}`;
            }

            case "head":
            case "tail": {
                if (!readTarget) return `[ERROR]: ${bin} requires a file path.`;
                let count = 10;
                const nFlag = rest.findIndex((token) => token === "-n");
                if (nFlag !== -1 && rest[nFlag + 1]) count = parseInt(rest[nFlag + 1]) || 10;
                const shortFlag = rest.find((token) => /^-\d+$/.test(token));
                if (shortFlag) count = parseInt(shortFlag.slice(1)) || 10;
                const lines = (await vfs.readFile(userId, readTarget, "")).split("\n");
                const slice = bin === "head" ? lines.slice(0, count) : lines.slice(-count);
                return `[WORKSPACE ${bin} ${readTarget}]:\n${truncateMiddle(slice.join("\n"), 12_000)}`;
            }

            case "wc": {
                if (!readTarget) return `[ERROR]: wc requires a file path.`;
                const content = await vfs.readFile(userId, readTarget, "");
                return `[WORKSPACE wc ${readTarget}]: ${content.split("\n").length} lines, ${content.length} chars`;
            }

            case "grep": {
                const pattern = positional[0];
                if (!pattern) return `[ERROR]: grep requires a search pattern.`;
                const results = await vfs.grepContent(userId, pattern);
                return `[WORKSPACE grep "${pattern}"]:\n${results.length ? results.join("\n") : "No matches."}`;
            }

            case "find": {
                const nameFlag = rest.findIndex((token) => token === "-name" || token === "-iname");
                const pattern = nameFlag !== -1 && rest[nameFlag + 1] ? rest[nameFlag + 1] : positional[0] || "";
                const results = await vfs.searchByName(userId, pattern);
                return `[WORKSPACE find "${pattern}"]:\n${results.length ? results.join("\n") : "No matches."}`;
            }

            case "touch": {
                if (!readTarget) return `[ERROR]: touch requires a file path.`;
                const result = await vfs.writeFile(userId, readTarget, "");
                return result.success
                    ? `[WORKSPACE touch]: Created empty file ${readTarget}`
                    : `[ERROR]: ${result.error || "Failed to create file"}`;
            }

            case "mkdir":
                return `[WORKSPACE mkdir]: Directories are implicit in the workspace — they appear when you write_to_file a path under them (e.g. write_to_file("${readTarget || "dir"}/index.ts")).`;

            default:
                return null;
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (readTarget && /not found/i.test(message)) {
            return `[ERROR]: ${message}.${await suggestClosestPaths(userId, readTarget)}`;
        }
        return `[ERROR]: ${message}`;
    }
}

/**
 * Run a parsed command plan in the workspace-seeded sandbox: sequential
 * segments with cd tracking, sync-back of files the commands created, and
 * detached dev servers exposed on a public preview URL.
 */
async function runCommandPlanInSandbox(
    userId: string,
    sandbox: AgentSandbox,
    segments: CommandSegment[],
): Promise<ExecuteToolResult> {
    const seeded = await sandbox.ensureSeeded(userId);
    if (!seeded.ok) {
        return { result: `[SANDBOX_ERROR]: Could not start the workspace sandbox: ${seeded.error}` };
    }

    const outputs: string[] = [];
    const events: AgentEvent[] = [];
    let segmentFailed = false;
    let devServerSegment: Extract<CommandSegment, { kind: "run" | "dev-server" }> | null = null;

    for (const segment of segments) {
        if (segment.kind === "cd") {
            sandbox.currentCwd = segment.dir;
            outputs.push(`[cwd]: ${segment.dir}`);
            continue;
        }

        if (segment.kind === "dev-server") {
            // Boot it last: once a detached server occupies the VM's command
            // stream, follow-up commands (like the sync-back find) get flaky.
            devServerSegment = segment;
            break;
        }

        const res = await sandbox.exec(segment.cmd, segment.args, { cwd: sandbox.currentCwd });
        const header = `[$ ${segment.raw}]${res.exitCode !== undefined ? ` (exit ${res.exitCode})` : ""}`;
        const body = [
            res.stdout && `[STDOUT]:\n${truncateMiddle(res.stdout, 16_000)}`,
            res.stderr && `[STDERR]:\n${truncateMiddle(res.stderr, 8_000)}`,
            res.error && `[ERROR]: ${res.error}`,
        ].filter(Boolean).join("\n");
        outputs.push(`${header}${body ? `\n${body}` : "\n(no output)"}`);

        if (!res.ok) {
            segmentFailed = true;
            break; // Mirror && semantics: stop the chain on failure.
        }
    }

    // Persist files the commands created (scaffolds, lockfiles) back into the
    // real workspace so they outlive the VM. Must run BEFORE a dev server
    // takes over the VM.
    try {
        const changed = await sandbox.collectChangedFiles();
        for (const file of changed) {
            const write = await vfs.writeFile(userId, file.path, file.content);
            if (write.success) {
                events.push({ type: "file_created", fileName: file.path, content: file.content });
            }
        }
        if (changed.length) {
            outputs.push(`[SYNCED_TO_WORKSPACE]: ${changed.map((file) => file.path).join(", ")}`);
        }
    } catch {
        // Sync-back is best-effort; command output above still stands.
    }

    if (devServerSegment && !segmentFailed) {
        const preview = await sandbox.startDevServer(userId, sandbox.currentCwd);
        if (preview.ok && preview.url) {
            events.push({ type: "preview_ready", url: preview.url, port: preview.port, timestamp: Date.now() });
            outputs.push(`[PREVIEW_READY]: ${preview.url}\nThe dev server is running detached in the sandbox (expires in ~15 minutes). Share this URL with the user in your reply.`);
        } else {
            segmentFailed = true;
            outputs.push(`[PREVIEW_FAILED]: ${preview.error || "Unknown error"}${preview.logTail ? `\n[SERVER_LOG_TAIL]:\n${truncateMiddle(preview.logTail, 4_000)}` : ""}`);
        }
    }

    if (segmentFailed) {
        outputs.push(`[NOTE]: Chain stopped at the first failing segment.`);
    }
    return { result: outputs.join("\n\n"), events };
}

export async function executeAgentTool({ userId, cwd, toolName, args, sandbox }: ExecuteToolParams): Promise<ExecuteToolResult> {
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

                // Fast path: while no seeded sandbox is live, serve file
                // inspection straight from the workspace (no VM cost, real files).
                if (!sandbox || !sandbox.isActive) {
                    const vfsCommandResult = await tryVfsCommand(userId, cmd);
                    if (vfsCommandResult !== null) {
                        return { result: vfsCommandResult };
                    }
                }

                const plan = parseCommandPlan(cmd, sandbox?.currentCwd ?? ".");
                if (!plan.ok) {
                    return { result: `[ERROR]: ${plan.error} ${COMMAND_RULES}` };
                }

                // Real path: the engine's per-run sandbox, seeded with the
                // user's actual project files.
                if (sandbox && currentRuntime.canUseSandbox) {
                    return runCommandPlanInSandbox(userId, sandbox, plan.segments);
                }

                if (!currentRuntime.canExecuteCommands && !currentRuntime.canUseSandbox) {
                    return { result: `[ERROR]: Command execution is disabled in the current runtime (${currentRuntime.runtimeName}). Use VFS or storage APIs instead.` };
                }

                const runnable = plan.segments.filter((segment) => segment.kind !== "cd");
                const single = runnable.length === 1 && runnable[0].kind === "run" ? runnable[0] : null;

                // Legacy empty-VM path (local-tool route without a seeded sandbox).
                if (currentRuntime.canUseSandbox) {
                    if (!single) {
                        return { result: `[ERROR]: Chained and dev-server commands need the workspace sandbox (available in cloud agent chat). Run a single command, or use the IDE's RUN / PREVIEW.` };
                    }
                    try {
                        const { runInSandbox } = await import("../sandbox");
                        const sandboxRes = await runInSandbox(single.cmd, single.args);
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
                    if (!single) {
                        return { result: `[ERROR]: Only single non-server commands can run in this runtime (${currentRuntime.runtimeName}).` };
                    }
                    const execFn = await getExecFile();
                    if (!execFn) return { result: `[ERROR]: Command execution unavailable in this runtime.` };
                    const { stdout, stderr } = await execFn(single.cmd, single.args, { cwd, timeout: 10000 });
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
