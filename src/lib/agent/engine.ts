
import { db } from "../db";
import { Prisma } from "@prisma/client";

interface AgentInternalState {
    history: AIMessage[];
    toolAttempts: { [key: string]: number };
    // Add other internal state variables as needed
}

interface AgentRunOptions {
    reasoningEffort?: "low" | "medium";
    autoFixErrors?: boolean;
}

import { getAICompletionWithDetailedError, AIMessage } from "../ai";
// import * as fs from "fs/promises"; // Removed for Cloudflare compatibility
import * as vfs from "./vm-fs";
import { buildProjectGraph, generateGraphSummary } from "../graph/project-graph";
import { currentRuntime } from "../runtime";
import { buildAgentSystemPrompt } from "./prompt";
import { compactAgentMessages, compactPersistedHistory, compactToolResult, truncateMiddle } from "./context-budget";
import type { AgentEvent } from "./events";

type DbFile = {
    name: string;
    content: string | null;
};

// Dynamic import of child_process to avoid CF Workers import failures
let execFile: ((file: string, args?: ReadonlyArray<string> | null, options?: import("child_process").ExecFileOptions) => Promise<{ stdout: string, stderr: string }>) | null = null;
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

// Helper to sanitize content from the LLM (remove accidental JSON stringification)
const sanitizeContent = (content: string): string => {
    if (!content) return "";

    const clean = content.trim();

    // Check for double-escaping (common with LLMs thinking they need to JSON.stringify)
    // e.g. "import React..." (with quotes)
    if (clean.startsWith('"') && clean.endsWith('"') && clean.includes('\\n')) {
        try {
            const parsed = JSON.parse(clean);
            if (typeof parsed === 'string') return parsed;
        } catch {
            // Fallback: manual unescape
            return clean.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }
    }

    return content;
};

const MAX_TURNS = 20;

const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'echo', 'pwd',
  'mkdir', 'touch', 'tree',
  'node', 'npx', 'npm', 'pnpm', 'yarn', 'tsc', 'eslint', 'prettier',
  'git'
]);

const isDestructiveCommand = (cmd: string): boolean => {
    const cmdLower = cmd.trim().toLowerCase();
    const firstToken = cmdLower.split(' ')[0];
    
    // Explicitly blocked patterns (defense in depth)
    if (cmdLower.includes('rm ') || cmdLower.includes('curl') || cmdLower.includes('wget') || 
        cmdLower.includes('python') || cmdLower.includes('nc') || cmdLower.includes('kill') || 
        cmdLower.includes('>') || cmdLower.includes('|') || cmdLower.includes('&') || cmdLower.includes('`') ||
        cmdLower.includes('$( )')) {
        return true;
    }

    return !ALLOWED_COMMANDS.has(firstToken);
};

/**
 * A Senior AI Software Engineer Agent inspired by Cline (Roo Code).
 * Features real file system access and streaming steps.
 */
export async function* runAgent(
    userId: string,
    sessionId: string, // Unique identifier for this agent run
    userMessage: string,
    contextFileId: string | undefined,
    activeFileContent: string | undefined,
    onStateChange?: (state: string, tool?: string) => void,
    initialHistory: AIMessage[] = [],
    modelName?: string,
    options: AgentRunOptions = {}
): AsyncGenerator<AgentEvent, void, unknown> {

    // Use process.cwd() as the base directory (read-only in serverless, writable via Supabase VFS overlay)
    const cwd = process.cwd();

    // Use VFS to get file list (UNION of Local FS + Supabase User Workspace)
    const fileList = await vfs.listFiles(userId, ".", cwd);

    // Build Project Graph for Context Awareness
    const dbFiles = await db.file.findMany({
        where: { userId },
        select: { name: true, content: true }
    });
    const graphFiles = dbFiles.map((f: DbFile) => ({ path: f.name, content: f.content || "" }));
    const graph = await buildProjectGraph(graphFiles);
    const graphSummary = generateGraphSummary(graph);

    let activeCtx = "";
    if (contextFileId && !contextFileId.includes("-")) {
        try {
            // Use VFS instead of direct fs for read-only safety in Edge
            const content = await vfs.readFile(userId, contextFileId, cwd);
            activeCtx = `\n[OPEN_FILE]: ${contextFileId}\n[CONTENT]:\n\`\`\`typescript\n${content}\n\`\`\`\n`;
        } catch { }
    } else if (activeFileContent) {
        activeCtx = `\n[OPEN_FILE]: (Active Buffer)\n[CONTENT]:\n\`\`\`\n${activeFileContent}\n\`\`\`\n`;
    }

    const CORE_SYSTEM_PROMPT = buildAgentSystemPrompt({
        cwd,
        fileList,
        graphSummary,
        activeContext: activeCtx,
        reasoningEffort: options.reasoningEffort,
        autoFixErrors: options.autoFixErrors,
    });

    let messages: AIMessage[] = [];
    let toolAttempts = new Map<string, number>();

    // Load existing agent state
    const existingAgentState = await db.agentState.findUnique({
        where: { sessionId: sessionId },
    });

    if (existingAgentState && existingAgentState.stateJson) {
        try {
            // Ensure stateJson is an object before casting
            if (typeof existingAgentState.stateJson === 'object' && existingAgentState.stateJson !== null) {
                const parsedState: AgentInternalState = existingAgentState.stateJson as unknown as AgentInternalState;
                messages = compactPersistedHistory(parsedState.history || []);
                toolAttempts = new Map(Object.entries(parsedState.toolAttempts || {}));
                // Restore other state variables here if needed
            } else {
                console.warn(`Agent state for session ${sessionId} is not a valid object. Initializing fresh state.`);
                messages = compactPersistedHistory(initialHistory);
                toolAttempts = new Map();
            }
        } catch (e) {
            console.error(`Failed to parse agent state for session ${sessionId}:`, e);
            messages = compactPersistedHistory(initialHistory);
            toolAttempts = new Map();
        }
    } else {
        messages = compactPersistedHistory(initialHistory);
        toolAttempts = new Map();
    }

    // Always push the current user message. The system prompt is intentionally not persisted.
    messages.push({ role: "user", content: userMessage });
    messages = compactPersistedHistory(messages);

    const MAX_RETRIES = 2;

    // Helper to determine if tool result should be shown to user
    function shouldShowToolResult(toolName: string, result: string): boolean {
        // Always show errors and exceptions
        if (result.includes('[ERROR]') || result.includes('[EXCEPTION]') || result.includes('[MAX_RETRIES]')) {
            return true;
        }

        // Hide successful patches (user sees code in response)
        if (toolName === 'apply_patch' && result.includes('[SUCCESS]')) {
            return false;
        }

        // Hide successful writes (user sees code in response)
        if (toolName === 'write_to_file' && result.includes('[SUCCESS]')) {
            return false;
        }

        // Hide small file lists (< 15 files)
        if (toolName === 'list_files') {
            const fileCount = result.split('\n').length;
            return fileCount >= 15;
        }

        // Hide small file reads (< 100 lines)
        if (toolName === 'read_file' || toolName === 'read_file_chunk') {
            const lineCount = result.split('\n').length;
            return lineCount >= 100;
        }

        // Show everything else
        return true;
    }

    let turns = 0;
    if (onStateChange) onStateChange("THINKING");

    while (turns < MAX_TURNS) {
        turns++;
        yield { type: "thought", content: "Thinking..." };

        const promptMessages: AIMessage[] = [
            { role: "system", content: CORE_SYSTEM_PROMPT },
            ...compactAgentMessages(messages),
        ];

        const result = await getAICompletionWithDetailedError(promptMessages, {
            temperature: 0.2,
            maxTokens: 8192,
            model: modelName,
            reasoningEffort: options.reasoningEffort,
            userId,
        });
        if (!result.success || !result.data || !result.data.content) {
            const errorReason = result.error || "Unknown connection error";
            const errorMsg = `⚠️ I encountered an error connecting to the AI provider: ${errorReason}`;
            yield { type: "response", content: errorMsg };
            yield { type: "error", message: errorMsg };
            return;
        }

        const response = result.data.content;
        messages.push({ role: "assistant", content: response });
        messages = compactPersistedHistory(messages);
        await saveAgentState(userId, sessionId, { history: messages, toolAttempts: Object.fromEntries(toolAttempts) });

        // ====== Multi-layer response sanitization ======
        let cleanedResponse = response;

        // 1. Strip <tool_code>...</tool_code> blocks (including malformed/multiline)
        cleanedResponse = cleanedResponse.replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '');

        // 2. Strip partial/unclosed tool_code tags
        cleanedResponse = cleanedResponse.replace(/<\/?tool_code>/gi, '');

        // 3. Strip <thinking>...</thinking> blocks
        cleanedResponse = cleanedResponse.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        cleanedResponse = cleanedResponse.replace(/<\/?thinking>/gi, '');

        // 4. Strip stray "call:tool_name(...)" patterns that leaked outside tags
        cleanedResponse = cleanedResponse.replace(/call:(read_file|write_to_file|apply_patch|list_files|execute_command|search_files|grep_search|read_file_chunk)\([^)]*\)/gi, '');

        // 5. Strip "I'll now use..." / "Let me use..." tool narration
        cleanedResponse = cleanedResponse.replace(/(?:I'll|Let me|I will|Now I'll)\s+(?:now\s+)?(?:use|call|invoke|run)\s+(?:the\s+)?(?:`?\w+`?\s+)?tool[^.]*\.?/gi, '');

        // 6. Strip [TOOL_OUTPUT] markers that sometimes leak
        cleanedResponse = cleanedResponse.replace(/\[TOOL_OUTPUT\]:[^\n]*/gi, '');

        // 7. Clean up excessive whitespace left by stripping
        cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n').trim();

        // Only emit if there's actual content after cleaning
        if (cleanedResponse) {
            yield { type: "response", content: cleanedResponse };
        }

        const toolCallRegex = /<tool_code>(?:call:)?(\w+)\(([\s\S]*?)\)<\/tool_code>/gi;
        let match;
        let foundTool = false;

        while ((match = toolCallRegex.exec(response)) !== null) {
            foundTool = true;
            const toolName = match[1];
            const rawArgsStr = match[2].trim();

            // Smarter argument parsing to handle quotes and multiple args
            const args = parseArgs(rawArgsStr);

            // Check retry limit
            const attemptKey = `${toolName}:${args[0] || 'global'}`;
            const attempts = toolAttempts.get(attemptKey) || 0;

            if (attempts >= MAX_RETRIES) {
                const toolResult = `[MAX_RETRIES]: Tool ${toolName} failed ${MAX_RETRIES} times. Please check the input or try a different approach.`;
                yield { type: "tool_result", result: toolResult };
                messages.push({ role: "user", content: `[TOOL_OUTPUT]: ${toolResult}` });
                messages = compactPersistedHistory(messages);
                continue; // Skip to next tool
            }

            toolAttempts.set(attemptKey, attempts + 1);

            if (onStateChange) onStateChange("EXECUTING", toolName);
            yield { type: "tool_call", tool: toolName, args: rawArgsStr };

            let toolResult = "";
            try {
                switch (toolName) {
                    case "read_file": {
                        // Use VFS to read (checks Supabase first, then Local)
                        const content = await vfs.readFile(userId, args[0], cwd);
                        toolResult = `[FILE_CONTENT: ${args[0]}]:\n${truncateMiddle(content, 12_000)}${content.length > 12_000 ? "\n[NOTE]: File truncated. Use read_file_chunk for exact sections." : ""}`;
                        break;
                    }

                    case "read_file_chunk": {
                        // Use VFS to read full content, then chunk
                        const start = parseInt(args[1]) || 0;
                        const end = parseInt(args[2]) || 100;
                        const content = await vfs.readFile(userId, args[0], cwd);
                        const lines = content.split('\n');
                        const chunk = lines.slice(start - 1, end).join('\n');
                        toolResult = `[FILE_CHUNK_LINES_${start}_TO_${end}]:\n${truncateMiddle(chunk, 12_000)}`;
                        break;
                    }

                    case "apply_patch": {
                        const filePath = args[0];
                        const snippet = args[1];

                        // Read original using VFS
                        const originalContent = await vfs.readFile(userId, filePath, cwd);

                        const { applyPatch } = await import("../code-patcher");
                        const patchResult = applyPatch(originalContent, snippet);

                        if (patchResult.success && patchResult.patchedCode) {
                            // Write patched content to VFS (Supabase)
                            const saveResult = await vfs.writeFile(userId, filePath, patchResult.patchedCode);
                            if (saveResult.success) {
                                toolResult = `[SUCCESS]: Patched ${filePath} using ${patchResult.method} method and saved to workspace.`;
                            } else {
                                toolResult = `[ERROR]: Failed to save patched file: ${saveResult.error || "Unknown error"}`;
                            }
                        } else {
                            toolResult = `[ERROR]: Patch failed. Ensure snippet matches original code exactly.`;
                        }
                        break;
                    }

                    case "write_to_file": {
                        const filePath = args[0];
                        const rawContent = args[1];
                        const content = sanitizeContent(rawContent);

                        // Write to VFS (Supabase)
                        const writeResult = await vfs.writeFile(userId, filePath, content);

                        if (writeResult.success) {
                            toolResult = `[SUCCESS]: Wrote ${content.length} characters to ${filePath} (Workspace Storage)`;
                            // Emit file_created event so the IDE can auto-refresh and auto-open
                            yield { type: "file_created", fileName: filePath, content: content };
                        } else {
                            toolResult = `[ERROR]: Failed to write file: ${writeResult.error || "Unknown error"}`;
                        }
                        break;
                    }

                    case "list_files": {
                        // Use VFS to list
                        const dir = args[0] || ".";
                        const files = await vfs.listFiles(userId, dir, cwd);
                        toolResult = `[FILES]:\n${files.join("\n")}`;
                        break;
                    }

                    case "execute_command": {
                        const cmd = args[0];
                        if (isDestructiveCommand(cmd)) {
                            toolResult = `[ERROR]: Command blocked for safety.`;
                        } else if (!currentRuntime.canExecuteCommands && !currentRuntime.canUseSandbox) {
                            toolResult = `[ERROR]: Command execution is disabled in the current runtime (${currentRuntime.runtimeName}). Use VFS or storage APIs instead.`;
                        } else {
                            // Use Vercel Sandbox where allowed or fallback to child_process
                            if (currentRuntime.canUseSandbox) {
                                try {
                                    const { runInSandbox } = await import("../sandbox");
                                    // Split command and args for sandbox
                                    const parts = splitCommand(cmd);
                                    const sandboxRes = await runInSandbox(parts[0], parts.slice(1));
                                    if (sandboxRes.success) {
                                        const out = sandboxRes.stdout ? truncateMiddle(sandboxRes.stdout, 20_000) : "(no output)";
                                        toolResult = `[SANDBOX_STDOUT]:\n${out}`;
                                        if (sandboxRes.stderr) {
                                            toolResult += `\n[SANDBOX_STDERR]:\n${truncateMiddle(sandboxRes.stderr, 12_000)}`;
                                        }
                                    } else {
                                        toolResult = `[SANDBOX_ERROR]:\n${sandboxRes.error}`;
                                    }
                                } catch (e: unknown) {
                                    toolResult = `[SANDBOX_EXCEPTION]: ${e instanceof Error ? e.message : String(e)}`;
                                }
                            } else if (currentRuntime.canExecuteCommands) {
                                const execFn = await getExecFile();
                                if (!execFn) {
                                    toolResult = `[ERROR]: Command execution unavailable in this runtime.`;
                                } else {
                                    const parts = splitCommand(cmd);
                                    const { stdout, stderr } = await execFn(parts[0], parts.slice(1), { cwd, timeout: 10000 });
                                    toolResult = `[STDOUT]:\n${truncateMiddle(stdout, 20_000)}\n[STDERR]:\n${truncateMiddle(stderr, 12_000)}`;
                                }
                            } else {
                                toolResult = `[ERROR]: Execution path blocked.`;
                            }
                        }
                        break;
                    }

                    case "search_files": {
                        if (!currentRuntime.canExecuteCommands) {
                             toolResult = `[ERROR]: search_files relies on shell execution which is disabled in ${currentRuntime.runtimeName}.`;
                             break;
                        }
                        const execFn = await getExecFile();
                        if (!execFn) {
                            toolResult = `[ERROR]: Command execution unavailable in this runtime.`;
                            break;
                        }
                        const pattern = args[0];
                        try {
                            const res = await execFn("find", [".", "-type", "f", "-name", `*${pattern}*`, "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*"], { cwd, timeout: 15000 });
                            const lines = (res.stdout || "").split("\n").slice(0, 25).join("\n");
                            toolResult = `[RESULTS]:\n${lines || "None found."}`;
                        } catch {
                            toolResult = `[RESULTS]:\nNone found.`;
                        }
                        break;
                    }

                    case "grep_search": {
                        if (!currentRuntime.canExecuteCommands) {
                             toolResult = `[ERROR]: grep_search relies on shell execution which is disabled in ${currentRuntime.runtimeName}.`;
                             break;
                        }
                        const execFn = await getExecFile();
                        if (!execFn) {
                            toolResult = `[ERROR]: Command execution unavailable in this runtime.`;
                            break;
                        }
                        const query = args[0];
                        try {
                            const res = await execFn("grep", ["-r", query, ".", "--exclude-dir=node_modules", "--exclude-dir=.git"], { cwd, timeout: 15000 });
                            const lines = (res.stdout || "").split("\n").slice(0, 25).join("\n");
                            toolResult = `[RESULTS]:\n${lines || "None found."}`;
                        } catch {
                            toolResult = `[RESULTS]:\nNone found.`;
                        }
                        break;
                    }

                    default:
                        toolResult = `[ERROR]: Tool '${toolName}' not found.`;
                }
            } catch (e: unknown) {
                toolResult = `[EXCEPTION]: ${e instanceof Error ? e.message : String(e)}`;
            }

            const compactedToolResult = compactToolResult(toolResult);

            // Only show result if it's important
            if (shouldShowToolResult(toolName, compactedToolResult)) {
                yield { type: "tool_result", result: compactedToolResult };
            }
            messages.push({ role: "user", content: `[TOOL_OUTPUT]: ${compactedToolResult}` });
            messages = compactPersistedHistory(messages);
            await saveAgentState(userId, sessionId, { history: messages, toolAttempts: Object.fromEntries(toolAttempts) });
            if (onStateChange) onStateChange("THINKING");
        }

        if (!foundTool) break;
    }

    if (onStateChange) onStateChange("COMPLETED");
    messages = compactPersistedHistory(messages);
    await saveAgentState(userId, sessionId, { history: messages, toolAttempts: Object.fromEntries(toolAttempts) });
}

async function saveAgentState(
    userId: string,
    sessionId: string,
    currentState: AgentInternalState
): Promise<void> {
    try {
        const sanitizedState: AgentInternalState = {
            ...currentState,
            history: compactPersistedHistory(currentState.history),
        };

        await db.agentState.upsert({
            where: { sessionId: sessionId },
            update: { stateJson: sanitizedState as unknown as Prisma.InputJsonValue },
            create: {
                userId: userId,
                sessionId: sessionId,
                stateJson: sanitizedState as unknown as Prisma.InputJsonValue,
            },
        });
    } catch (e) {
        console.error(`Failed to save agent state for session ${sessionId}:`, e);
    }
}

function parseArgs(raw: string): string[] {
    // Simple parser for arg1, arg2 where arg1 might be quoted string or raw path
    const args: string[] = [];
    let current = "";
    let inQuotes: string | null = null;
    let i = 0;

    while (i < raw.length) {
        const char = raw[i];
        if (char === '"' || char === "'") {
            if (inQuotes === char) {
                inQuotes = null;
            } else if (!inQuotes) {
                inQuotes = char;
            } else {
                current += char;
            }
        } else if (char === ',' && !inQuotes) {
            args.push(current.trim());
            current = "";
        } else {
            current += char;
        }
        i++;
    }
    args.push(current.trim());
    return args;
}

function splitCommand(command: string): string[] {
    const tokens: string[] = [];
    const matcher = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(command)) !== null) {
        const token = match[1] ?? match[2] ?? match[0];
        tokens.push(token.replace(/\\(["'])/g, "$1"));
    }

    return tokens;
}

