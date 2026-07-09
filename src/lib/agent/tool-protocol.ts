/**
 * The agent's tool-calling wire format — shared between the server-side loop
 * (engine.ts, calling a cloud model) and the browser-side loop (local-agent.ts,
 * calling a model the user runs on their own machine).
 *
 * This is deliberately a *text* protocol, not the OpenAI structured
 * function-calling API: the model just writes
 * `<tool_code>call:tool_name(arg1, arg2)</tool_code>` in its plain completion,
 * and we regex it out. That's what makes it possible to point this whole loop
 * at a local model with no function-calling support at all — it only needs to
 * follow a text instruction from the system prompt (see prompt.ts).
 *
 * Pure, framework-agnostic module: no server-only imports, safe in the browser.
 */

export const AGENT_TOOL_NAMES = [
    "read_file",
    "read_file_chunk",
    "apply_patch",
    "write_to_file",
    "list_files",
    "execute_command",
    "search_files",
    "grep_search",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export function isAgentToolName(value: string): value is AgentToolName {
    return (AGENT_TOOL_NAMES as readonly string[]).includes(value);
}

export const MAX_TURNS = 20;
export const MAX_TOOL_RETRIES = 2;

export const ALLOWED_COMMANDS = new Set([
    "ls", "cat", "head", "tail", "wc", "find", "grep", "echo", "pwd",
    "mkdir", "touch", "tree",
    "node", "npx", "npm", "pnpm", "yarn", "tsc", "eslint", "prettier",
    "git",
]);

/** Defense-in-depth blocklist on top of the allowlist above. */
export function isDestructiveCommand(cmd: string): boolean {
    const cmdLower = cmd.trim().toLowerCase();
    const firstToken = cmdLower.split(" ")[0];

    if (
        cmdLower.includes("rm ") || cmdLower.includes("curl") || cmdLower.includes("wget") ||
        cmdLower.includes("python") || cmdLower.includes("nc") || cmdLower.includes("kill") ||
        cmdLower.includes(">") || cmdLower.includes("|") || cmdLower.includes("&") || cmdLower.includes("`") ||
        cmdLower.includes("$( )")
    ) {
        return true;
    }

    return !ALLOWED_COMMANDS.has(firstToken);
}

/** Split a shell command string into argv tokens, respecting quotes. */
export function splitCommand(command: string): string[] {
    const tokens: string[] = [];
    const matcher = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(command)) !== null) {
        const token = match[1] ?? match[2] ?? match[0];
        tokens.push(token.replace(/\\(["'])/g, "$1"));
    }

    return tokens;
}

/**
 * Named-argument keywords the models use in practice (Python/JSON-kwarg style),
 * e.g. `read_file(path="a.ts")` or `read_file_chunk(path="a.ts", startLine=1)`.
 * We accept positional args but strip a leading `<keyword>=`/`<keyword>:` so the
 * value isn't polluted with the parameter name — the single biggest cause of
 * "file not found: path=..." with smaller local models.
 */
const TOOL_ARG_KEYWORD = /^\s*(?:path|filepath|filename|file|dir|directory|folder|query|q|pattern|search|command|cmd|content|code|body|text|snippet|patch|start|end|start_?line|end_?line|line|lines|from|to)\s*[:=]\s*/i;

/** Strip a leading kwarg name and any wrapping quotes from a single argument. */
function cleanToolArg(arg: string): string {
    let cleaned = arg.replace(TOOL_ARG_KEYWORD, "");
    // A quote may now lead/trail (e.g. the value was `path="x"` → `"x"`).
    if (cleaned.length >= 2) {
        const first = cleaned[0];
        const last = cleaned[cleaned.length - 1];
        if ((first === '"' || first === "'" || first === "`") && last === first) {
            cleaned = cleaned.slice(1, -1);
        }
    }
    return cleaned.trim();
}

/** Parse a `<tool_code>` argument list: `arg1, "arg 2", arg3` → ["arg1", "arg 2", "arg3"]. */
export function parseToolArgs(raw: string): string[] {
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
        } else if (char === "," && !inQuotes) {
            args.push(cleanToolArg(current));
            current = "";
        } else {
            current += char;
        }
        i++;
    }
    args.push(cleanToolArg(current));
    return args;
}

export interface ParsedToolCall {
    toolName: string;
    rawArgsStr: string;
    args: string[];
}

const TOOL_CALL_REGEX = /<tool_code>(?:call:)?(\w+)\(([\s\S]*?)\)<\/tool_code>/gi;

/** Extract every `<tool_code>call:name(args)</tool_code>` block from a raw completion. */
export function parseToolCalls(response: string): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(TOOL_CALL_REGEX);
    while ((match = regex.exec(response)) !== null) {
        const rawArgsStr = match[2].trim();
        calls.push({ toolName: match[1], rawArgsStr, args: parseToolArgs(rawArgsStr) });
    }
    return calls;
}

/** Strip tool-call markup, hidden chain-of-thought, and other leakage from user-facing text. */
export function sanitizeAgentResponse(response: string): string {
    let cleaned = response;

    cleaned = cleaned.replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, "");
    cleaned = cleaned.replace(/<\/?tool_code>/gi, "");
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    cleaned = cleaned.replace(/<\/?thinking>/gi, "");
    cleaned = cleaned.replace(/call:(read_file|write_to_file|apply_patch|list_files|execute_command|search_files|grep_search)\([^)]*\)/gi, "");
    cleaned = cleaned.replace(/(?:I'll|Let me|I will|Now I'll)\s+(?:now\s+)?(?:use|call|invoke|run)\s+(?:the\s+)?(?:`?\w+`?\s+)?tool[^.]*\.?/gi, "");
    cleaned = cleaned.replace(/\[TOOL_OUTPUT\]:[^\n]*/gi, "");
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

    return cleaned;
}

export interface ChatTurn {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Normalize a conversation for a strict local chat template. Many local models
 * (Qwen among them) render prompts with a jinja template that rejects a leading
 * assistant turn — throwing "No user query found in messages." — or requires
 * user/assistant turns to strictly alternate. Cloud models tolerate a looser
 * shape, but local ones don't, so before sending we:
 *   - drop system + empty messages (the system prompt is supplied separately),
 *   - drop any leading non-user turns so the conversation starts with a user
 *     message (this removes the UI greeting/error bubbles), and
 *   - merge consecutive same-role turns so roles strictly alternate.
 */
export function normalizeConversation(messages: ChatTurn[]): ChatTurn[] {
    const cleaned = messages.filter((m) => m.role !== "system" && m.content.trim().length > 0);
    while (cleaned.length > 0 && cleaned[0].role !== "user") cleaned.shift();

    const out: ChatTurn[] = [];
    for (const m of cleaned) {
        const last = out[out.length - 1];
        if (last && last.role === m.role) {
            last.content = `${last.content}\n\n${m.content}`;
        } else {
            out.push({ role: m.role, content: m.content });
        }
    }
    return out;
}

/** Whether a tool result is worth showing in the "thinking" trace, or safe to hide as noise. */
export function shouldShowToolResult(toolName: string, result: string): boolean {
    if (result.includes("[ERROR]") || result.includes("[EXCEPTION]") || result.includes("[MAX_RETRIES]")) {
        return true;
    }
    if (toolName === "apply_patch" && result.includes("[SUCCESS]")) return false;
    if (toolName === "write_to_file" && result.includes("[SUCCESS]")) return false;
    if (toolName === "list_files") return result.split("\n").length >= 15;
    if (toolName === "read_file" || toolName === "read_file_chunk") return result.split("\n").length >= 100;
    return true;
}
