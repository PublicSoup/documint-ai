"use client";

/**
 * Client-orchestrated mirror of `runAgent` (lib/agent/engine.ts), for a model
 * the user runs on their own machine (see lib/local-model.ts).
 *
 * The cloud agent's tool protocol is plain text — `<tool_code>call:name(args)
 * </tool_code>` inside an ordinary completion (lib/agent/tool-protocol.ts) —
 * not the OpenAI structured function-calling API. That's what makes this
 * possible at all: any local model that can follow a text instruction can
 * drive the exact same loop, whether or not its server implements function
 * calling. The model call itself goes straight to the user's local server
 * (browser → localhost); each tool call it requests is executed by POSTing to
 * /api/agent/local-tool, which runs the identical tool-executor the cloud
 * agent uses, scoped to the authenticated session's own workspace.
 *
 * Yields the same `AgentEvent` union the server's SSE stream produces, so the
 * existing chat UI (ai-chat-panel.tsx's handleAgentEvent) needs no local-mode
 * special-casing to render it.
 */

import type { AIMessage } from "./ai";
import { buildAgentSystemPrompt } from "./agent/prompt";
import { compactAgentMessages, compactPersistedHistory, compactToolResult } from "./agent/context-budget";
import {
    MAX_TOOL_RETRIES,
    MAX_TURNS,
    isAgentToolName,
    parseToolCalls,
    sanitizeAgentResponse,
    shouldShowToolResult,
} from "./agent/tool-protocol";
import type { AgentEvent } from "./agent/events";
import { streamLocalChatCompletion, type LocalModelConfig } from "./local-model";

interface LocalAgentContext {
    cwd: string;
    fileList: string[];
    graphSummary: string;
}

async function fetchLocalAgentContext(signal?: AbortSignal): Promise<LocalAgentContext> {
    const res = await fetch("/api/agent/local-context", { credentials: "include", signal });
    if (!res.ok) {
        throw new Error(`Could not load workspace context (HTTP ${res.status}). Try again in a moment.`);
    }
    return res.json();
}

interface LocalToolResponse {
    result: string;
    fileEvent?: { fileName: string; content: string };
}

async function callLocalTool(toolName: string, args: string[], signal?: AbortSignal): Promise<LocalToolResponse> {
    try {
        const res = await fetch("/api/agent/local-tool", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolName, args }),
            signal,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => null);
            return { result: `[ERROR]: ${data?.message ?? data?.error ?? `Tool request failed (HTTP ${res.status})`}` };
        }
        return await res.json();
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        return { result: `[EXCEPTION]: ${e instanceof Error ? e.message : "Tool request failed"}` };
    }
}

export interface RunLocalAgentParams {
    config: LocalModelConfig;
    userMessage: string;
    additionalContext?: string;
    activeFileContent?: string;
    /** Prior turns, oldest first — same shape ai-chat-panel already builds via buildCompactChatHistory. */
    history: Array<{ role: "user" | "assistant"; content: string }>;
    reasoningEffort?: "low" | "medium";
    autoFixErrors?: boolean;
    signal?: AbortSignal;
}

export async function* runLocalAgent(params: RunLocalAgentParams): AsyncGenerator<AgentEvent, void, unknown> {
    const { config, userMessage, additionalContext, activeFileContent, history, reasoningEffort, autoFixErrors, signal } = params;

    let context: LocalAgentContext;
    try {
        context = await fetchLocalAgentContext(signal);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load workspace context.";
        yield { type: "response", content: `⚠️ ${message}` };
        yield { type: "error", message };
        return;
    }

    const activeCtx = activeFileContent
        ? `\n[OPEN_FILE]: (Active Buffer)\n[CONTENT]:\n\`\`\`\n${activeFileContent}\n\`\`\`\n`
        : "";

    const systemPrompt = buildAgentSystemPrompt({
        cwd: context.cwd,
        fileList: context.fileList,
        graphSummary: context.graphSummary,
        activeContext: activeCtx,
        reasoningEffort,
        autoFixErrors,
    });

    const fullUserMessage = additionalContext
        ? `${userMessage}\n\nAdditional Context:\n${additionalContext}`
        : userMessage;

    let messages: AIMessage[] = compactPersistedHistory([...history, { role: "user", content: fullUserMessage }]);
    const toolAttempts = new Map<string, number>();

    let turns = 0;
    yield { type: "state_change", state: "THINKING", timestamp: Date.now() };

    while (turns < MAX_TURNS) {
        turns++;
        yield { type: "thought", content: "Thinking..." };

        const promptMessages: AIMessage[] = [
            { role: "system", content: systemPrompt },
            ...compactAgentMessages(messages),
        ];

        let response: string;
        try {
            response = await streamLocalChatCompletion(config, promptMessages, { signal });
        } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            const message = e instanceof Error ? e.message : "Local model request failed.";
            yield { type: "response", content: `⚠️ I encountered an error connecting to the local model: ${message}` };
            yield { type: "error", message };
            return;
        }

        if (!response.trim()) {
            const message = "The local model returned an empty response.";
            yield { type: "response", content: `⚠️ ${message}` };
            yield { type: "error", message };
            return;
        }

        messages.push({ role: "assistant", content: response });
        messages = compactPersistedHistory(messages);

        const cleanedResponse = sanitizeAgentResponse(response);
        if (cleanedResponse) {
            yield { type: "response", content: cleanedResponse };
        }

        const toolCalls = parseToolCalls(response);

        for (const { toolName, rawArgsStr, args } of toolCalls) {
            const attemptKey = `${toolName}:${args[0] || "global"}`;
            const attempts = toolAttempts.get(attemptKey) || 0;

            if (attempts >= MAX_TOOL_RETRIES) {
                const toolResult = `[MAX_RETRIES]: Tool ${toolName} failed ${MAX_TOOL_RETRIES} times. Please check the input or try a different approach.`;
                yield { type: "tool_result", result: toolResult };
                messages.push({ role: "user", content: `[TOOL_OUTPUT]: ${toolResult}` });
                messages = compactPersistedHistory(messages);
                continue;
            }
            toolAttempts.set(attemptKey, attempts + 1);

            yield { type: "state_change", state: "EXECUTING", tool: toolName, timestamp: Date.now() };
            yield { type: "tool_call", tool: toolName, args: rawArgsStr };

            const { result: toolResult, fileEvent } = isAgentToolName(toolName)
                ? await callLocalTool(toolName, args, signal)
                : { result: `[ERROR]: Tool '${toolName}' not found.`, fileEvent: undefined };

            if (fileEvent) {
                yield { type: "file_created", fileName: fileEvent.fileName, content: fileEvent.content };
            }

            const compactedToolResult = compactToolResult(toolResult);
            if (shouldShowToolResult(toolName, compactedToolResult)) {
                yield { type: "tool_result", result: compactedToolResult };
            }
            messages.push({ role: "user", content: `[TOOL_OUTPUT]: ${compactedToolResult}` });
            messages = compactPersistedHistory(messages);
            yield { type: "state_change", state: "THINKING", timestamp: Date.now() };
        }

        if (toolCalls.length === 0) break;
    }

    yield { type: "state_change", state: "COMPLETED", timestamp: Date.now() };
}
