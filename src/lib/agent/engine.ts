
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
import { buildAgentSystemPrompt } from "./prompt";
import { compactAgentMessages, compactPersistedHistory, compactToolResult } from "./context-budget";
import type { AgentEvent } from "./events";
import { MAX_TOOL_RETRIES, MAX_TURNS, isAgentToolName, parseToolCalls, sanitizeAgentResponse, shouldShowToolResult } from "./tool-protocol";
import { executeAgentTool } from "./tool-executor";

type DbFile = {
    name: string;
    content: string | null;
};

/**
 * A Senior AI Software Engineer Agent inspired by Cline (Roo Code).
 * Features real file system access and streaming steps.
 *
 * The tool-call parsing/sanitization (tool-protocol.ts) and the tool dispatch
 * itself (tool-executor.ts) are shared with /api/agent/local-tool, which lets
 * a model the user runs on their own machine (LM Studio, Ollama, ...) drive
 * this exact same loop from the browser — see lib/local-agent.ts.
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

        const cleanedResponse = sanitizeAgentResponse(response);
        if (cleanedResponse) {
            yield { type: "response", content: cleanedResponse };
        }

        const toolCalls = parseToolCalls(response);

        for (const { toolName, rawArgsStr, args } of toolCalls) {
            // Check retry limit
            const attemptKey = `${toolName}:${args[0] || 'global'}`;
            const attempts = toolAttempts.get(attemptKey) || 0;

            if (attempts >= MAX_TOOL_RETRIES) {
                const toolResult = `[MAX_RETRIES]: Tool ${toolName} failed ${MAX_TOOL_RETRIES} times. Please check the input or try a different approach.`;
                yield { type: "tool_result", result: toolResult };
                messages.push({ role: "user", content: `[TOOL_OUTPUT]: ${toolResult}` });
                messages = compactPersistedHistory(messages);
                continue; // Skip to next tool
            }

            toolAttempts.set(attemptKey, attempts + 1);

            if (onStateChange) onStateChange("EXECUTING", toolName);
            yield { type: "tool_call", tool: toolName, args: rawArgsStr };

            const { result: toolResult, fileEvent } = isAgentToolName(toolName)
                ? await executeAgentTool({ userId, cwd, toolName, args })
                : { result: `[ERROR]: Tool '${toolName}' not found.`, fileEvent: undefined };

            if (fileEvent) {
                yield { type: "file_created", fileName: fileEvent.fileName, content: fileEvent.content };
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

        if (toolCalls.length === 0) break;
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
