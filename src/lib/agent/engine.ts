
import { db } from "../db";
import { AgentState } from "@prisma/client";

interface AgentInternalState {
    history: any[];
    toolAttempts: { [key: string]: number };
    // Add other internal state variables as needed
}

import { getAICompletion, getAICompletionWithDetailedError } from "../ai";
// import * as fs from "fs/promises"; // Removed for Cloudflare compatibility
import * as path from "path";
import * as vfs from "./vm-fs";
import { buildProjectGraph, generateGraphSummary } from "../graph/project-graph";
import { currentRuntime } from "../runtime";

type DbFile = {
    name: string;
    content: string | null;
};

// Dynamic import of child_process to avoid CF Workers import failures
let execFile: any = null;
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

    let clean = content.trim();

    // Check for double-escaping (common with LLMs thinking they need to JSON.stringify)
    // e.g. "import React..." (with quotes)
    if (clean.startsWith('"') && clean.endsWith('"') && clean.includes('\\n')) {
        try {
            const parsed = JSON.parse(clean);
            if (typeof parsed === 'string') return parsed;
        } catch (e) {
            // Fallback: manual unescape
            return clean.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }
    }

    return content;
};

export type AgentEvent =
    | { type: "thought"; content: string }
    | { type: "tool_call"; tool: string; args: string }
    | { type: "tool_result"; result: string }
    | { type: "response"; content: string }
    | { type: "error"; message: string }
    | { type: "file_created"; fileName: string; content: string }
    | { type: "state_change"; state: string; tool?: string; timestamp: number };

const MAX_TURNS = 20;

// Safety checks for destructive commands
const DESTRUCTIVE_COMMANDS = [
    'rm -rf',
    'rm -r',
    'rm -f',
    'shutdown',
    'reboot',
    'format',
    'dd if=/dev/zero',
    ':(){ :|:& };:' // Fork bomb
];

const isDestructiveCommand = (cmd: string): boolean => {
    const cmdLower = cmd.toLowerCase();
    return DESTRUCTIVE_COMMANDS.some(destructive =>
        cmdLower.includes(destructive) ||
        (cmdLower.includes('delete') && cmdLower.includes('all'))
    );
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
    initialHistory: any[] = []
): AsyncGenerator<AgentEvent, void, unknown> {

    // Use process.cwd() as the base directory (read-only in serverless, writable via Supabase VFS overlay)
    const cwd = process.cwd();

    // Use VFS to get file list (UNION of Local FS + Supabase User Workspace)
    const fileList = await vfs.listFiles(userId, ".", cwd);
    const fileListSnippet = fileList.slice(0, 150).join("\n");

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
        } catch (e) { }
    } else if (activeFileContent) {
        activeCtx = `\n[OPEN_FILE]: (Active Buffer)\n[CONTENT]:\n\`\`\`\n${activeFileContent}\n\`\`\`\n`;
    }

    const CORE_SYSTEM_PROMPT = `
You are **DocuMint AI Architect**, an elite Senior Full-Stack Engineer embedded in a Cloud IDE.
You have REAL file system access via Supabase VFS. You behave exactly like Cursor AI.

## RESPONSE FORMAT — CRITICAL
- Lead with CODE, not explanation. Show the complete code in a fenced markdown block first.
- After the code block, add ONE short sentence describing what you did.
- NEVER include raw tool calls, XML tags, or internal markers in your response text.
- NEVER say "I'll now use write_to_file" or describe your tool usage in prose.
- Tool calls are INVISIBLE to the user — just use them silently after your code.
- Keep responses SHORT. No essays, no line-by-line explanations, no preambles.

## PRIME DIRECTIVE
Write **COMPLETE, PRODUCTION-READY code**. Never generate skeleton code, placeholders, or TODOs.
Every file must be fully functional and beautifully styled out of the box.

## CODE QUALITY
- React functional components with hooks, TypeScript types (no \`any\`)
- Tailwind CSS for all styling — responsive, mobile-first
- Premium UI: gradients, shadows, hover states, transitions, spacing
- Real content — no placeholders, no "add your API key here"
- Complete files: imports, component, exports — everything included

## FILE OPERATIONS
- \`apply_patch\` for small targeted edits (read_file first)
- \`write_to_file\` for new files or full rewrites (pass RAW content, NOT JSON stringified)
- Always \`read_file\` before modifying existing files

## TOOLS
1. **list_files(dir)** — List files in a directory.
2. **read_file(path)** — Read a file's content.
3. **read_file_chunk(path, startLine, endLine)** — Read specific lines.
4. **apply_patch(path, snippet)** — Surgically edit a file.
5. **write_to_file(path, content)** — Create or overwrite a file.
6. **execute_command(cmd)** — Run a shell command.
7. **search_files(pattern)** — Search for files matching a pattern.
8. **grep_search(query)** — Search inside files.

## TOOL CALL FORMAT (INTERNAL ONLY — never show this to user)
<tool_code>call:tool_name(arg1, arg2, ...)</tool_code>

## PROJECT CONTEXT
CWD: ${cwd}
Files:
${fileListSnippet}

## Topology
${graphSummary}

${activeCtx}
`;

    let messages: any[] = [];
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
                messages = parsedState.history || [];
                toolAttempts = new Map(Object.entries(parsedState.toolAttempts || {}));
                // Restore other state variables here if needed
                console.log(`Agent state loaded for session ${sessionId}. History length: ${messages.length}`);
            } else {
                console.warn(`Agent state for session ${sessionId} is not a valid object. Initializing fresh state.`);
                messages = initialHistory;
                toolAttempts = new Map();
            }
        } catch (e) {
            console.error(`Failed to parse agent state for session ${sessionId}:`, e);
            messages = initialHistory;
            toolAttempts = new Map();
        }
    } else {
        messages = initialHistory;
        toolAttempts = new Map();
    }

    // Always push the current user message to the messages array, whether loaded or fresh
    messages.push({ role: "system", content: CORE_SYSTEM_PROMPT });
    messages.push({ role: "user", content: userMessage });

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

        const result = await getAICompletionWithDetailedError(messages, { temperature: 0.1 });
        if (!result.success || !result.data || !result.data.content) {
            const errorReason = result.error || "Unknown connection error";
            const errorMsg = `⚠️ I encountered an error connecting to the AI provider: ${errorReason}`;
            yield { type: "response", content: errorMsg };
            yield { type: "error", message: errorMsg };
            return;
        }

        const response = result.data.content;
        messages.push({ role: "assistant", content: response });
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
                        toolResult = `[FILE_CONTENT]:\n${content}`;
                        break;
                    }

                    case "read_file_chunk": {
                        // Use VFS to read full content, then chunk
                        const start = parseInt(args[1]) || 0;
                        const end = parseInt(args[2]) || 100;
                        const content = await vfs.readFile(userId, args[0], cwd);
                        const lines = content.split('\n');
                        const chunk = lines.slice(start - 1, end).join('\n');
                        toolResult = `[FILE_CHUNK_LINES_${start}_TO_${end}]:\n${chunk}`;
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
                            // Use Vercel Sandbox in production (if enabled), fall back to child_process in local dev
                            if (currentRuntime.canUseSandbox && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
                                try {
                                    const { runInSandbox } = await import("../sandbox");
                                    // Split command and args for sandbox
                                    const parts = cmd.split(' ');
                                    const sandboxRes = await runInSandbox(parts[0], parts.slice(1));
                                    if (sandboxRes.success) {
                                        toolResult = `[SANDBOX_STDOUT]:\n${sandboxRes.stdout || "(no output)"}`;
                                        if (sandboxRes.stderr) {
                                            toolResult += `\n[SANDBOX_STDERR]:\n${sandboxRes.stderr}`;
                                        }
                                    } else {
                                        toolResult = `[SANDBOX_ERROR]:\n${sandboxRes.error}`;
                                    }
                                } catch (e: any) {
                                    toolResult = `[SANDBOX_EXCEPTION]: ${e.message}`;
                                }
                            } else if (currentRuntime.canExecuteCommands) {
                                const execFn = await getExecFile();
                                if (!execFn) {
                                    toolResult = `[ERROR]: Command execution unavailable in this runtime.`;
                                } else {
                                    const parts = cmd.split(' ');
                                    const { stdout, stderr } = await execFn(parts[0], parts.slice(1), { cwd, timeout: 30000 });
                                    toolResult = `[STDOUT]:\n${stdout}\n[STDERR]:\n${stderr}`;
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
                        } catch (e: any) {
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
                        } catch (e: any) {
                            toolResult = `[RESULTS]:\nNone found.`;
                        }
                        break;
                    }

                    default:
                        toolResult = `[ERROR]: Tool '${toolName}' not found.`;
                }
            } catch (e: any) {
                toolResult = `[EXCEPTION]: ${e.message}`;
            }

            // Only show result if it's important
            if (shouldShowToolResult(toolName, toolResult)) {
                yield { type: "tool_result", result: toolResult };
            }
            messages.push({ role: "user", content: `[TOOL_OUTPUT]: ${toolResult}` });
            await saveAgentState(userId, sessionId, { history: messages, toolAttempts: Object.fromEntries(toolAttempts) });
            if (onStateChange) onStateChange("THINKING");
        }

        if (!foundTool) break;
    }

    if (onStateChange) onStateChange("COMPLETED");
    await saveAgentState(userId, sessionId, { history: messages, toolAttempts: Object.fromEntries(toolAttempts) });
}

async function saveAgentState(
    userId: string,
    sessionId: string,
    currentState: AgentInternalState
): Promise<void> {
    try {
        await db.agentState.upsert({
            where: { sessionId: sessionId },
            update: { stateJson: currentState as any }, // Prisma needs `any` for Json type updates
            create: {
                userId: userId,
                sessionId: sessionId,
                stateJson: currentState as any,
            },
        });
        // console.log(`Agent state saved for session ${sessionId}.`);
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

