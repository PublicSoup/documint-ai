import type { AIMessage } from "../ai";

export const AGENT_CONTEXT_LIMITS = {
    activeFileChars: 18_000,
    fileListItems: 80,
    fileListChars: 8_000,
    graphSummaryChars: 10_000,
    historyMessages: 14,
    historyMessageChars: 4_000,
    toolResultChars: 12_000,
    persistedHistoryMessages: 24,
    persistedMessageChars: 6_000,
} as const;

export function estimateTokens(value: string): number {
    return Math.ceil(value.length / 4);
}

export function truncateMiddle(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;

    const marker = `\n...[truncated ${value.length - maxChars} chars]...\n`;
    const available = Math.max(0, maxChars - marker.length);
    const head = Math.ceil(available * 0.58);
    const tail = Math.floor(available * 0.42);

    return `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`;
}

export function truncateEnd(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`;
}

export function compactLines(lines: string[], maxItems: number, maxChars: number): string {
    const selected = lines.slice(0, maxItems);
    const suffix = lines.length > selected.length ? `\n...and ${lines.length - selected.length} more files` : "";
    return truncateEnd(`${selected.join("\n")}${suffix}`, maxChars);
}

export function compactAgentMessages(
    input: AIMessage[],
    options: {
        maxMessages?: number;
        maxMessageChars?: number;
        includeSystem?: boolean;
    } = {}
): AIMessage[] {
    const maxMessages = options.maxMessages ?? AGENT_CONTEXT_LIMITS.historyMessages;
    const maxMessageChars = options.maxMessageChars ?? AGENT_CONTEXT_LIMITS.historyMessageChars;

    return input
        .filter((message) => options.includeSystem || message.role !== "system")
        .filter((message) => message.content.trim().length > 0)
        .slice(-maxMessages)
        .map((message) => ({
            role: message.role,
            content: truncateMiddle(message.content, maxMessageChars),
        }));
}

export function compactToolResult(result: string): string {
    return truncateMiddle(result, AGENT_CONTEXT_LIMITS.toolResultChars);
}

export function compactPersistedHistory(messages: AIMessage[]): AIMessage[] {
    return compactAgentMessages(messages, {
        includeSystem: false,
        maxMessages: AGENT_CONTEXT_LIMITS.persistedHistoryMessages,
        maxMessageChars: AGENT_CONTEXT_LIMITS.persistedMessageChars,
    });
}
