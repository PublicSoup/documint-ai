import { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Persistent IDE chat sessions.
 *
 * A ChatSession stores the UI-facing transcript (what the user sees in the
 * panel, including the agent's process log), while AgentState — keyed by the
 * same session id — stores the LLM-facing history the engine resumes from.
 */

export interface StoredThoughtStep {
    id: string;
    type: "thought" | "tool_call" | "tool_result" | "error" | "command" | "preview" | "error_report";
    content: string;
    toolName?: string;
    timestamp: number;
}

export interface StoredFileOp {
    id: string;
    path: string;
    action: "create" | "edit";
    timestamp: number;
}

export interface StoredChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    thoughtSteps?: StoredThoughtStep[];
    fileOps?: StoredFileOp[];
    previewUrl?: string;
    timestamp: number;
}

/** Keep transcripts bounded: enough for long conversations, safe for a JSONB column. */
const MAX_STORED_MESSAGES = 200;
const MAX_STORED_CONTENT_CHARS = 40_000;
const MAX_STORED_STEPS = 120;
const MAX_STEP_CONTENT_CHARS = 600;

export function deriveSessionTitle(firstMessage: string): string {
    const singleLine = firstMessage.replace(/\s+/g, " ").trim();
    if (!singleLine) return "New chat";
    return singleLine.length > 60 ? `${singleLine.slice(0, 57)}...` : singleLine;
}

function boundMessage(message: StoredChatMessage): StoredChatMessage {
    return {
        ...message,
        content: message.content.slice(0, MAX_STORED_CONTENT_CHARS),
        thoughtSteps: message.thoughtSteps
            ?.slice(0, MAX_STORED_STEPS)
            .map((step) => ({ ...step, content: step.content.slice(0, MAX_STEP_CONTENT_CHARS) })),
        fileOps: message.fileOps?.slice(0, 50),
    };
}

export function parseStoredMessages(raw: Prisma.JsonValue | null | undefined): StoredChatMessage[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is StoredChatMessage & Record<string, never> => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
        const candidate = entry as Record<string, unknown>;
        return (
            typeof candidate.id === "string" &&
            (candidate.role === "user" || candidate.role === "assistant") &&
            typeof candidate.content === "string" &&
            typeof candidate.timestamp === "number"
        );
    });
}

/** Append messages to a session's transcript (read-modify-write, bounded). */
export async function appendMessagesToSession(
    sessionId: string,
    userId: string,
    newMessages: StoredChatMessage[],
    model?: string,
): Promise<void> {
    try {
        const session = await db.chatSession.findFirst({
            where: { id: sessionId, userId },
            select: { messages: true },
        });
        if (!session) return;

        const existing = parseStoredMessages(session.messages);
        const combined = [...existing, ...newMessages.map(boundMessage)].slice(-MAX_STORED_MESSAGES);

        await db.chatSession.update({
            where: { id: sessionId },
            data: {
                messages: combined as unknown as Prisma.InputJsonValue,
                ...(model ? { model } : {}),
            },
        });
    } catch (error) {
        // Transcript persistence must never break the chat request itself.
        console.error(`Failed to persist chat transcript for session ${sessionId}:`, error);
    }
}
