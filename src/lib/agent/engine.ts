
import { db } from "../db";
import { getAICompletion, getAICompletionWithDetailedError } from "../ai";
import * as fs from "fs/promises"; // Keep for utility usage if needed, but VFS preferred
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as vfs from "./vm-fs";
import { buildProjectGraph, generateGraphSummary } from "../graph/project-graph";

const execAsync = promisify(exec);

// Helper function to detect comment-related requests
const isCommentRequest = (message: string): boolean => {
    const commentKeywords = [
        'comment', 'explain this', 'document this', 'add comments',
        'help me understand', 'what does this do', 'describe this',
        'clarify this', 'annotate this', 'comment on', 'explain code',
        'code explanation', 'what is this code', 'how does this work'
    ];
    const lowerMessage = message.toLowerCase();
    return commentKeywords.some(keyword => lowerMessage.includes(keyword));
};

// Generate concise, Cline-like explanations for simple code
const generateConciseExplanation = (code: string): string => {
    const trimmedCode = code.trim();

    // Handle single line expressions
    if (!trimmedCode.includes('\n') && trimmedCode.length < 100) {
        if (trimmedCode.includes('console.log')) {
            return "Outputs text to the console - commonly used for debugging.";
        }
        if (trimmedCode.includes('=')) {
            return "Assigns a value to a variable.";
        }
        if (trimmedCode.match(/^\d+$/)) {
            return "This is a numeric literal.";
        }
        if (trimmedCode.match(/^['"`].*['"`]$/)) {
            return "This is a string literal.";
        }
        if (trimmedCode.includes('return')) {
            return "Returns a value from a function.";
        }
    }

    // Handle common patterns
    if (trimmedCode.includes('console.log')) {
        return "Logs output to console for debugging/testing.";
    }
    if (trimmedCode.includes('function') || trimmedCode.includes('=>')) {
        return "Defines a reusable function/method.";
    }
    if (trimmedCode.includes('import') || trimmedCode.includes('require')) {
        return "Imports external modules/libraries.";
    }
    if (trimmedCode.includes('export')) {
        return "Exports code for use in other files.";
    }
    if (trimmedCode.includes('class')) {
        return "Defines a class blueprint for objects.";
    }
    if (trimmedCode.includes('if') || trimmedCode.includes('else')) {
        return "Conditional logic based on boolean expressions.";
    }
    if (trimmedCode.includes('for') || trimmedCode.includes('while')) {
        return "Loops through code multiple times.";
    }
    if (trimmedCode.includes('try') || trimmedCode.includes('catch')) {
        return "Handles errors and exceptions.";
    }

    return "Simple code snippet. Need help with something specific?";
};

// Clean up overly verbose AI responses to be more Cline-like
const cleanVerboseResponse = (response: string): string => {
    let cleaned = response
        .replace(/### Explanation:/gi, '')
        .replace(/1\. File Name:[\s\S]*?(?=\n\n|$)/gi, '')
        .replace(/2\. Code Content:/gi, '')
        .replace(/3\. What It Does:/gi, '**What it does:**')
        .replace(/\(e\.g\.,/gi, '(')
        .replace(/etc\.\)/gi, ')')
        .replace(/Here's what this code does:/gi, '')
        .replace(/Let me explain this code:/gi, '')
        .replace(/In simple terms:/gi, '')
        .replace(/Sure! Let's break this down\.\.\./gi, '')
        .replace(/Let me walk you through this:/gi, '')
        .replace(/\*\*Summary\*\*:/gi, 'Summary:')
        .replace(/\*\*Purpose\*\*:/gi, 'Purpose:')
        .replace(/\*\*Key Points\*\*:/gi, 'Key Points:')
        .replace(/\*\*Note\*\*:/gi, 'Note:')
        .trim();

    // Remove excessive whitespace and newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // If the response starts with a code block, add a brief intro
    if (cleaned.startsWith('```')) {
        cleaned = "Here's the code with helpful comments:\n\n" + cleaned;
    }

    return cleaned;
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
    userMessage: string,
    contextFileId: string | undefined,
    activeFileContent: string | undefined,
    onStateChange?: (state: string, tool?: string) => void,
    history: any[] = []
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
    const graphFiles = dbFiles.map(f => ({ path: f.name, content: f.content || "" }));
    const graph = await buildProjectGraph(graphFiles);
    const graphSummary = generateGraphSummary(graph);

    let activeCtx = "";
    if (contextFileId && !contextFileId.includes("-")) {
        try {
            const content = await fs.readFile(path.resolve(cwd, contextFileId), 'utf-8');
            activeCtx = `\n[OPEN_FILE]: ${contextFileId}\n[CONTENT]:\n\`\`\`typescript\n${content}\n\`\`\`\n`;
        } catch (e) { }
    } else if (activeFileContent) {
        activeCtx = `\n[OPEN_FILE]: (Active Buffer)\n[CONTENT]:\n\`\`\`\n${activeFileContent}\n\`\`\`\n`;
    }

    const CORE_SYSTEM_PROMPT = `
You are **DocuMint AI Architect**, a world-class Senior Full-Stack Engineer (like Cursor AI).
You run inside the DocuMint Cloud IDE with REAL file system access via Supabase VFS.

## PRIME DIRECTIVE
You write **COMPLETE, PRODUCTION-READY code**. Never generate skeleton code, placeholders, or TODOs.
Every file you create must be fully functional and styled. You are an expert in React, TypeScript, Next.js, Tailwind CSS, and modern web development.

## OUTPUT RULES
1. **ALWAYS show full code** in a markdown code block BEFORE using tools to write it.
2. **Complete implementations only** — no "replace with actual image", no "add your API key here", no placeholder comments.
3. **Include all styling** — use Tailwind CSS classes or inline styles. Output must look premium out of the box.
4. **Minimize narration** — don't explain line by line. Write the code, briefly describe what it does, then apply it.
5. **Fail fast** — if a tool fails twice, stop and ask the user.

## CODE QUALITY STANDARDS
- Modern React patterns (functional components, hooks)
- Semantic HTML5 elements
- Responsive design (mobile-first with Tailwind breakpoints)
- Proper TypeScript types (no \`any\` unless unavoidable)
- Beautiful UI: gradients, shadows, hover states, transitions, proper spacing
- Real content — use realistic placeholder text, not "Lorem ipsum"

## WHEN CREATING NEW FILES
- Write the COMPLETE file content — imports, component, exports, everything.
- Use descriptive file names that match Next.js conventions (e.g. \`page.tsx\`, \`layout.tsx\`).
- Include all CSS/Tailwind classes inline — don't reference external stylesheets that don't exist.

## WHEN MODIFYING FILES
- Use \`apply_patch\` for small targeted edits.
- Use \`write_to_file\` only for new files or complete rewrites.
- Always \`read_file\` first to understand the current state.

## TOOLS
1. **list_files(dir)** — List files in a directory.
2. **read_file(path)** — Read a file's content.
3. **read_file_chunk(path, startLine, endLine)** — Read specific lines from a large file.
4. **apply_patch(path, snippet)** — Surgically edit a file.
5. **write_to_file(path, content)** — Create or overwrite a file.
6. **execute_command(cmd)** — Run a shell command.
7. **search_files(pattern)** — Search for files matching a pattern.
8. **grep_search(query)** — Search for content within files.

## TOOL CALL FORMAT
<tool_code>call:tool_name(arg1, arg2, ...)</tool_code>

Example:
<tool_code>call:read_file("src/app/page.tsx")</tool_code>

## PROJECT CONTEXT
CWD: ${cwd}
Relevant Files:
${fileListSnippet}

## Project Topology
${graphSummary}

${activeCtx}
`;

    const messages: any[] = [
        { role: "system", content: CORE_SYSTEM_PROMPT },
        ...history.slice(-10), // Keep last 10 messages for context
        { role: "user", content: userMessage }
    ];

    // Track tool attempts to prevent infinite retry loops
    const toolAttempts = new Map<string, number>();
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

        let finalResponse = response;
        if (isCommentRequest(userMessage)) {
            if (activeFileContent && activeFileContent.length < 150 && userMessage.length < 30) {
                finalResponse = `Here's a clear explanation of this code:\n\n\`\`\`javascript\n${activeFileContent}\n\`\`\`\n\n${generateConciseExplanation(activeFileContent)}`;
            }
        }

        // Strip tool_code blocks from user-visible response
        const cleanedResponse = finalResponse.replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '').trim();

        yield { type: "response", content: cleanedResponse || finalResponse };

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
                            const saved = await vfs.writeFile(userId, filePath, patchResult.patchedCode);
                            if (saved) {
                                toolResult = `[SUCCESS]: Patched ${filePath} using ${patchResult.method} method and saved to workspace.`;
                            } else {
                                toolResult = `[ERROR]: Failed to save patched file to storage.`;
                            }
                        } else {
                            toolResult = `[ERROR]: Patch failed. Ensure snippet matches original code exactly.`;
                        }
                        break;
                    }

                    case "write_to_file": {
                        const filePath = args[0];
                        const content = args[1];

                        // Write to VFS (Supabase)
                        const saved = await vfs.writeFile(userId, filePath, content);

                        if (saved) {
                            toolResult = `[SUCCESS]: Wrote ${content.length} characters to ${filePath} (Workspace Storage)`;
                            // Emit file_created event so the IDE can auto-refresh and auto-open
                            yield { type: "file_created", fileName: filePath, content: content };
                        } else {
                            toolResult = `[ERROR]: Failed to write file to storage. Check logs.`;
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
                        } else {
                            // Use Vercel Sandbox in production, fall back to child_process in local dev
                            if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
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
                            } else {
                                const { stdout, stderr } = await execAsync(cmd, { cwd });
                                toolResult = `[STDOUT]:\n${stdout}\n[STDERR]:\n${stderr}`;
                            }
                        }
                        break;
                    }

                    case "search_files": {
                        const pattern = args[0];
                        const findCmd = `find . -type f -name "*${pattern}*" -not -path "*/node_modules/*" -not -path "*/.git/*" | head -n 25`;
                        const res = await execAsync(findCmd, { cwd }).catch(e => ({ stdout: "", stderr: e.message }));
                        toolResult = `[RESULTS]:\n${res.stdout || "None found."}`;
                        break;
                    }

                    case "grep_search": {
                        const query = args[0];
                        const grepCmd = `grep -r "${query.replace(/"/g, '\\"')}" . --exclude-dir=node_modules --exclude-dir=.git | head -n 25`;
                        const res = await execAsync(grepCmd, { cwd }).catch(e => ({ stdout: "", stderr: e.message }));
                        toolResult = `[RESULTS]:\n${res.stdout || "None found."}`;
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
            if (onStateChange) onStateChange("THINKING");
        }

        if (!foundTool) break;
    }

    if (onStateChange) onStateChange("COMPLETED");
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

async function getSimpleFileList(dir: string, depth = 0): Promise<string[]> {
    if (depth > 2) return [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const results: string[] = [];
        for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.next') continue;
            const resPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const subs = await getSimpleFileList(resPath, depth + 1);
                results.push(...subs.map(s => path.join(entry.name, s)));
            } else {
                results.push(entry.name);
            }
        }
        return results;
    } catch { return []; }
}
