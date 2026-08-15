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
    "node", "npx", "npm", "pnpm", "yarn", "tsc", "eslint", "prettier", "vite",
    "git",
]);

export const COMMAND_RULES = `Allowed commands: ${[...ALLOWED_COMMANDS].join(", ")} (plus cd). Chaining with && or ; is supported; pipes (|), redirects (>/<), backticks, subshells and backgrounding (&) are not. Dev servers (npm run dev / vite / next dev) are started automatically in the background and return a public preview URL.`;

export type CommandSegment =
    | { kind: "cd"; dir: string }
    | { kind: "run" | "dev-server"; cmd: string; args: string[]; raw: string };

export type CommandPlan =
    | { ok: true; segments: CommandSegment[] }
    | { ok: false; error: string };

const DEV_SERVER_RE = /^((npm|pnpm|bun)\s+(run\s+)?(dev|start)\b|yarn\s+(run\s+)?dev\b|(npx\s+)?vite\b(?!\s+build)|(npx\s+)?next\s+dev\b)/;

/** Resolve `cd` targets against the current virtual cwd (project-relative). */
export function resolveCd(current: string, target: string): string {
    if (!target || target === "/" || target === "~") return ".";
    const base = current === "." ? [] : current.split("/");
    const parts = target.startsWith("/") ? target.slice(1).split("/") : [...base, ...target.split("/")];
    const stack: string[] = [];
    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") stack.pop();
        else stack.push(part);
    }
    return stack.length ? stack.join("/") : ".";
}

/**
 * Parse a shell-ish command line into an executable plan. Supports `cd` and
 * `&&`/`;` chaining (each segment allowlisted), and classifies dev-server
 * launches so the executor can detach them with a public preview URL instead
 * of blocking or rejecting the command.
 */
export function parseCommandPlan(raw: string, baseCwd: string): CommandPlan {
    const cleaned = (raw || "").trim();
    if (!cleaned) return { ok: false, error: "Empty command." };
    if (/[|<>`]|\$\(/.test(cleaned)) {
        return { ok: false, error: "Pipes, redirects, backticks and subshells are not supported." };
    }
    if (/(^|[^&])&([^&]|$)/.test(cleaned)) {
        return { ok: false, error: "Backgrounding with & is not supported — dev servers are detached automatically." };
    }

    const segments: CommandSegment[] = [];
    let cwd = baseCwd || ".";

    for (const part of cleaned.split(/&&|;/).map((s) => s.trim()).filter(Boolean)) {
        if (part === "cd" || part.startsWith("cd ")) {
            cwd = resolveCd(cwd, part.slice(2).trim().replace(/^["']|["']$/g, ""));
            segments.push({ kind: "cd", dir: cwd });
            continue;
        }

        const tokens = splitCommand(part);
        const bin = tokens[0] || "";
        if (!ALLOWED_COMMANDS.has(bin)) {
            return { ok: false, error: `Command '${bin}' is not allowed.` };
        }
        segments.push({
            kind: DEV_SERVER_RE.test(part) ? "dev-server" : "run",
            cmd: bin,
            args: tokens.slice(1),
            raw: part,
        });
    }

    if (!segments.some((segment) => segment.kind !== "cd")) {
        return { ok: false, error: "Command contains no executable segment." };
    }
    return { ok: true, segments };
}

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

const TAGS = "tool_code|tool_call|function_call|tool_use";
// The opening `<tag>` + `name(args)` already uniquely identifies an inline call,
// so the closing tag is OPTIONAL — no trailing delimiter is required. This is
// what makes the malformed Laguna form work in every position: a chain like
// `<tool_call>a("x")<tool_call>b("y")` (no proper closes) and, crucially, a
// final call followed by ordinary prose (`<tool_call>b("y") thanks!`) both parse
// AND get stripped by the sanitizer. (`\)` non-greedy up to the first paren
// bounds the args, so we don't rely on the close to delimit.)
const INLINE_REGEX = new RegExp(`<(${TAGS})>\\s*(?:call:)?(\\w+)\\(([\\s\\S]*?)\\)(?:\\s*<\\/\\1>)?`, "gi");
const BLOCK_REGEX = new RegExp(`<(${TAGS})>\\s*(?:call:)?(\\w+)\\(([^)\\n]*)\\)\\s*<content>\\r?\\n?([\\s\\S]*?)\\r?\\n?<\\/content>(?:\\s*<\\/\\1>|(?=\\s*<(?:${TAGS})>|$))`, "gi");
const JSON_TAG_REGEX = new RegExp(`<(${TAGS})>\\s*(\\{[\\s\\S]*?\\})\\s*(?:<\\/\\1>|(?=\\s*<(?:${TAGS})>|$))`, "gi");
const MISTRAL_REGEX = /\[TOOL_CALLS\]\s*(\[[\s\S]*?\])/gi;
const MD_REGEX = new RegExp(`\`\`\`(?:${TAGS})\\s*\\n(?:call:)?(\\w+)\\(([\\s\\S]*?)\\)\\s*\\n\`\`\``, "gi");
const INLINE_STRICT_REGEX = new RegExp(`<(${TAGS})>\\s*(?:call:)?(\\w+)\\(([\\s\\S]*?)\\)<\\/\\1>`, "gi");

/** Extract every tool call (content-block or inline form) from a raw completion, in order. */
export function parseToolCalls(response: string): ParsedToolCall[] {
    const calls: Array<ParsedToolCall & { index: number }> = [];
    const consumed: Array<[number, number]> = [];

    const isConsumed = (start: number, end: number) => consumed.some(([from, to]) => Math.max(start, from) < Math.min(end, to));
    const consume = (start: number, end: number) => consumed.push([start, end]);

    let match: RegExpExecArray | null;

    // 1. Mistral [TOOL_CALLS] array
    const mistralRegex = new RegExp(MISTRAL_REGEX);
    while ((match = mistralRegex.exec(response)) !== null) {
        if (isConsumed(match.index, match.index + match[0].length)) continue;
        try {
            const arr = JSON.parse(match[1]);
            if (Array.isArray(arr)) {
                for (const item of arr) {
                    if (item.name && typeof item.arguments === 'object') {
                        let args: string[] = [];
                        const argsDict = item.arguments;
                        if (item.name === "read_file" || item.name === "list_files" || item.name === "apply_patch" || item.name === "write_to_file") {
                            args.push(argsDict.path || argsDict.dir || "");
                            if (argsDict.content) args.push(argsDict.content);
                        } else if (item.name === "read_file_chunk") {
                            args.push(argsDict.path || "", String(argsDict.start || ""), String(argsDict.end || ""));
                        } else if (item.name === "search_files") {
                            args.push(argsDict.namePattern || argsDict.pattern || argsDict.query || "");
                        } else if (item.name === "grep_search") {
                            args.push(argsDict.text || argsDict.query || "");
                        } else if (item.name === "execute_command") {
                            args.push(argsDict.cmd || argsDict.command || "");
                        } else {
                            args = Object.values(argsDict).map(String);
                        }
                        calls.push({
                            toolName: item.name,
                            rawArgsStr: JSON.stringify(item.arguments),
                            args,
                            index: match.index,
                        });
                    }
                }
                consume(match.index, match.index + match[0].length);
            }
        } catch (e) {
            // ignore JSON parse error
        }
    }

    // 2. Block form
    const blockRegex = new RegExp(BLOCK_REGEX);
    while ((match = blockRegex.exec(response)) !== null) {
        if (isConsumed(match.index, match.index + match[0].length)) continue;
        const pathArgs = parseToolArgs(match[3].trim()).filter(Boolean);
        calls.push({
            toolName: match[2],
            rawArgsStr: match[3].trim(),
            args: [...pathArgs, match[4]],
            index: match.index,
        });
        consume(match.index, match.index + match[0].length);
    }

    // 3. JSON inside tags
    const jsonTagRegex = new RegExp(JSON_TAG_REGEX);
    while ((match = jsonTagRegex.exec(response)) !== null) {
        if (isConsumed(match.index, match.index + match[0].length)) continue;
        try {
            const item = JSON.parse(match[2]);
            if (item.name && typeof item.arguments === 'object') {
                let args: string[] = [];
                const argsDict = item.arguments;
                if (item.name === "read_file" || item.name === "list_files" || item.name === "apply_patch" || item.name === "write_to_file") {
                    args.push(argsDict.path || argsDict.dir || "");
                    if (argsDict.content) args.push(argsDict.content);
                } else if (item.name === "read_file_chunk") {
                    args.push(argsDict.path || "", String(argsDict.start || ""), String(argsDict.end || ""));
                } else if (item.name === "search_files") {
                    args.push(argsDict.namePattern || argsDict.pattern || argsDict.query || "");
                } else if (item.name === "grep_search") {
                    args.push(argsDict.text || argsDict.query || "");
                } else if (item.name === "execute_command") {
                    args.push(argsDict.cmd || argsDict.command || "");
                } else {
                    args = Object.values(argsDict).map(String);
                }
                calls.push({
                    toolName: item.name,
                    rawArgsStr: JSON.stringify(item.arguments),
                    args,
                    index: match.index,
                });
                consume(match.index, match.index + match[0].length);
            }
        } catch (e) {
            // ignore
        }
    }

    // 4. Markdown code block form
    const mdRegex = new RegExp(MD_REGEX);
    while ((match = mdRegex.exec(response)) !== null) {
        if (isConsumed(match.index, match.index + match[0].length)) continue;
        const rawArgsStr = match[2].trim();
        calls.push({ toolName: match[1], rawArgsStr, args: parseToolArgs(rawArgsStr), index: match.index });
        consume(match.index, match.index + match[0].length);
    }

    // 5. Inline form (with missing or proper closing tags)
    const inlineRegex = new RegExp(INLINE_REGEX);
    while ((match = inlineRegex.exec(response)) !== null) {
        if (isConsumed(match.index, match.index + match[0].length)) continue;
        const rawArgsStr = match[3].trim();
        calls.push({ toolName: match[2], rawArgsStr, args: parseToolArgs(rawArgsStr), index: match.index });
        consume(match.index, match.index + match[0].length);
    }
    
    // 6. Fallback inline strict form
    const inlineStrictRegex = new RegExp(INLINE_STRICT_REGEX);
    while ((match = inlineStrictRegex.exec(response)) !== null) {
        if (isConsumed(match.index, match.index + match[0].length)) continue;
        const rawArgsStr = match[3].trim();
        calls.push({ toolName: match[2], rawArgsStr, args: parseToolArgs(rawArgsStr), index: match.index });
        consume(match.index, match.index + match[0].length);
    }

    return calls.sort((a, b) => a.index - b.index).map(({ toolName, rawArgsStr, args }) => ({ toolName, rawArgsStr, args }));
}

/** Strip tool-call markup, hidden chain-of-thought, and other leakage from user-facing text. */
export function sanitizeAgentResponse(response: string): string {
    let cleaned = response;

    cleaned = cleaned.replace(new RegExp(MISTRAL_REGEX), "");
    cleaned = cleaned.replace(new RegExp(`\`\`\`(?:${TAGS})\\s*\\n[\\s\\S]*?\\n\`\`\``, "gi"), "");
    cleaned = cleaned.replace(new RegExp(BLOCK_REGEX), "");
    cleaned = cleaned.replace(new RegExp(JSON_TAG_REGEX), "");
    cleaned = cleaned.replace(new RegExp(INLINE_REGEX), "");
    cleaned = cleaned.replace(new RegExp(INLINE_STRICT_REGEX), "");

    cleaned = cleaned.replace(new RegExp(`<\\/?(?:${TAGS})>`, "gi"), "");
    cleaned = cleaned.replace(/<\/?content>/gi, "");
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    // Reasoning-model style (<think>, Nemotron/DeepSeek): strip full blocks, and
    // treat everything before an orphan closing tag as reasoning too.
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
    const lastCloseThink = cleaned.toLowerCase().lastIndexOf("</think>");
    if (lastCloseThink !== -1) {
        cleaned = cleaned.slice(lastCloseThink + "</think>".length);
    }
    cleaned = cleaned.replace(/<\/?think(?:ing)?>/gi, "");
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
