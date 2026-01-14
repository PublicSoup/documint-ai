
import { getAICompletion } from "../ai";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

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
    onStateChange?: (state: string, tool?: string) => void
): AsyncGenerator<AgentEvent, void, unknown> {

    const cwd = process.cwd();
    const fileList = await getSimpleFileList(cwd);
    const fileListSnippet = fileList.slice(0, 150).join("\n");

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
You are **Cline**, a Senior AI Software Engineer. You excel at debugging, refactoring, and documentation.
You are running in a **DocuMint AI** environment. You have access to the ACTUAL FILE SYSTEM.

### YOUR PHILOSOPHY
- **Surgical Precision**: Prefer \`apply_patch\` for small edits. Use \`write_to_file\` ONLY for new files or full rewrites.
- **Exploration First**: Never guess. Use \`list_files\` and \`read_file\` to verify context before acting.
- **Conciseness**: Don't ramble. Be direct and helpful.
- **Safety**: Never run destructive commands.

### TOOLS
1. **list_files(dir)**: Lists files in a directory.
2. **read_file(path)**: Reads the content of a file.
3. **read_file_chunk(path, startLine, endLine)**: Reads a specific range of lines from a large file.
4. **apply_patch(path, snippet)**: Target a specific function or block to update within a file. The snippet should contain enough context to uniquely identify the location.
5. **write_to_file(path, content)**: Creates a new file or overwrites an existing one.
6. **execute_command(cmd)**: Runs a shell command.
7. **search_files(pattern)**: Searches for filenames matching a pattern.
8. **grep_search(query)**: Searches for string content within files.

### TOOL CALL FORMAT
Use the following format to call a tool:
<tool_code>call:tool_name(arg1, arg2, ...)</tool_code>

Example:
<tool_code>call:read_file("src/app/page.tsx")</tool_code>

### PROJECT CONTEXT
CWD: ${cwd}
Relevant Files:
${fileListSnippet}

${activeCtx}
`;

    const messages: any[] = [
        { role: "system", content: CORE_SYSTEM_PROMPT },
        { role: "user", content: userMessage }
    ];

    let turns = 0;
    if (onStateChange) onStateChange("THINKING");

    while (turns < MAX_TURNS) {
        turns++;
        yield { type: "thought", content: "Thinking..." };

        const result = await getAICompletion(messages, { temperature: 0.1 });
        if (!result || !result.content) {
            yield { type: "error", message: "AI returned empty response" };
            return;
        }

        const response = result.content;
        messages.push({ role: "assistant", content: response });

        let finalResponse = response;
        if (isCommentRequest(userMessage)) {
            finalResponse = cleanVerboseResponse(response);
            if (activeFileContent && activeFileContent.length < 150 && userMessage.length < 30) {
                finalResponse = `Here's a clear explanation of this code:\n\n\`\`\`javascript\n${activeFileContent}\n\`\`\`\n\n${generateConciseExplanation(activeFileContent)}`;
            }
        }

        yield { type: "response", content: finalResponse };

        const toolCallRegex = /<tool_code>call:(\w+)\(([\s\S]*?)\)<\/tool_code>/gi;
        let match;
        let foundTool = false;

        while ((match = toolCallRegex.exec(response)) !== null) {
            foundTool = true;
            const toolName = match[1];
            const rawArgsStr = match[2].trim();

            // Smarter argument parsing to handle quotes and multiple args
            const args = parseArgs(rawArgsStr);

            if (onStateChange) onStateChange("EXECUTING", toolName);
            yield { type: "tool_call", tool: toolName, args: rawArgsStr };

            let toolResult = "";
            try {
                switch (toolName) {
                    case "read_file": {
                        const filePath = path.resolve(cwd, args[0]);
                        const content = await fs.readFile(filePath, 'utf-8');
                        toolResult = `[FILE_CONTENT]:\n${content}`;
                        break;
                    }

                    case "read_file_chunk": {
                        const filePath = path.resolve(cwd, args[0]);
                        const start = parseInt(args[1]) || 0;
                        const end = parseInt(args[2]) || 100;
                        const content = await fs.readFile(filePath, 'utf-8');
                        const lines = content.split('\n');
                        const chunk = lines.slice(start - 1, end).join('\n');
                        toolResult = `[FILE_CHUNK_LINES_${start}_TO_${end}]:\n${chunk}`;
                        break;
                    }

                    case "apply_patch": {
                        const filePath = args[0];
                        const snippet = args[1];
                        const targetPath = path.resolve(cwd, filePath);
                        const originalContent = await fs.readFile(targetPath, 'utf-8');

                        const { applyPatch } = await import("../code-patcher");
                        const patchResult = applyPatch(originalContent, snippet);

                        if (patchResult.success && patchResult.patchedCode) {
                            await fs.writeFile(targetPath, patchResult.patchedCode, 'utf-8');
                            toolResult = `[SUCCESS]: Patched ${filePath} using ${patchResult.method} method.`;
                        } else {
                            toolResult = `[ERROR]: Patch failed. Ensure snippet matches original code exactly.`;
                        }
                        break;
                    }

                    case "write_to_file": {
                        const filePath = args[0];
                        const content = args[1];
                        const writePath = path.resolve(cwd, filePath);
                        await fs.mkdir(path.dirname(writePath), { recursive: true });
                        await fs.writeFile(writePath, content, 'utf-8');
                        toolResult = `[SUCCESS]: Wrote ${content.length} characters to ${filePath}`;
                        break;
                    }

                    case "list_files": {
                        const dir = args[0] ? path.resolve(cwd, args[0]) : cwd;
                        const entries = await fs.readdir(dir);
                        const filtered = entries.filter(e => !['node_modules', '.git', '.next'].includes(e));
                        toolResult = `[FILES]:\n${filtered.join("\n")}`;
                        break;
                    }

                    case "execute_command": {
                        const cmd = args[0];
                        if (isDestructiveCommand(cmd)) {
                            toolResult = `[ERROR]: Command blocked for safety.`;
                        } else {
                            const { stdout, stderr } = await execAsync(cmd, { cwd });
                            toolResult = `[STDOUT]:\n${stdout}\n[STDERR]:\n${stderr}`;
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

            yield { type: "tool_result", result: toolResult };
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
