import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUserSubscription } from "@/lib/subscription";
import { runAgent } from "@/lib/agent/engine";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { serializeAgentEvent, type AgentEvent } from "@/lib/agent/events";
import { isModelAllowed } from "@/lib/ai-model-catalog";
import { db } from "@/lib/db";
import { appendMessagesToSession, deriveSessionTitle, type StoredThoughtStep } from "@/lib/chat-sessions";

export const maxDuration = 300;

const historyMessageSchema = z
    .object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(10_000),
    })
    .strict();

const chatRequestSchema = z
    .object({
        message: z.string().trim().min(1).max(8_000),
        history: z.array(historyMessageSchema).max(30).default([]),
        sessionId: z.string().uuid().optional(),
        contextFileId: z.string().min(1).max(255).optional(),
        contextContent: z.string().max(50_000).optional(),
        additionalContext: z.string().max(5_000).optional(),
        model: z.string().max(200).optional(),
        reasoningEffort: z.enum(["low", "medium"]).default("low"),
        autoFixErrors: z.boolean().default(true),
        stream: z.boolean().default(true),
    })
    .strict();

/** Accumulates the assistant side of the run for transcript persistence. */
function createTranscriptCollector() {
    let assistantContent = "";
    const thoughtSteps: StoredThoughtStep[] = [];

    const collect = (event: AgentEvent) => {
        if (event.type === "response") {
            assistantContent += event.content;
        } else if (event.type === "thought") {
            thoughtSteps.push({ id: crypto.randomUUID(), type: "thought", content: event.content, timestamp: Date.now() });
        } else if (event.type === "tool_call") {
            thoughtSteps.push({ id: crypto.randomUUID(), type: "tool_call", content: `Invoking tool: ${event.tool}`, toolName: event.tool, timestamp: Date.now() });
        } else if (event.type === "tool_result") {
            thoughtSteps.push({ id: crypto.randomUUID(), type: "tool_result", content: event.result.slice(0, 200) + (event.result.length > 200 ? "..." : ""), timestamp: Date.now() });
        } else if (event.type === "error") {
            thoughtSteps.push({ id: crypto.randomUUID(), type: "error", content: event.message, timestamp: Date.now() });
        }
    };

    return {
        collect,
        snapshot: () => ({ assistantContent, thoughtSteps }),
    };
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }
        const userId = session.user.id;

        const subscription = await getUserSubscription(userId);
        const rateLimitTier = (subscription.isPro || subscription.isTeam) ? "pro" : "chat";
        await enforceRateLimit(userId, rateLimitTier);

        const {
            message, history, sessionId: requestedSessionId, contextFileId, contextContent,
            additionalContext, stream, model, reasoningEffort, autoFixErrors,
        } = await validateBody(req, chatRequestSchema);

        // OpenRouter models are chosen from its live catalog, so the concrete id
        // ("openrouter/<vendor>/<model>") won't be in the static list — allow any
        // well-formed openrouter/* id and let the provider reject unknown models.
        // Everything else must be a known static model or in the gateway catalog.
        const isOpenRouterModel = typeof model === "string" && /^openrouter\/[\w./:-]+$/.test(model) && model.length <= 200;
        if (model && !isOpenRouterModel && !(await isModelAllowed(model))) {
            throw ApiErrors.badRequest("Unsupported AI model selected.");
        }

        // Resolve the persistent chat session: reuse the caller's (ownership
        // enforced) or start a new one titled after the first message. The
        // session id doubles as the agent-state key, which is what lets the
        // agent actually remember earlier turns of the conversation.
        let chatSession;
        if (requestedSessionId) {
            chatSession = await db.chatSession.findFirst({
                where: { id: requestedSessionId, userId },
                select: { id: true, title: true },
            });
            if (!chatSession) {
                throw ApiErrors.notFound("Chat session");
            }
        } else {
            chatSession = await db.chatSession.create({
                data: { userId, title: deriveSessionTitle(message), model },
                select: { id: true, title: true },
            });
        }
        const sessionId = chatSession.id;
        const requestStartedAt = Date.now();

        const fullMessage = additionalContext
            ? `${message}\n\nAdditional Context:\n${additionalContext}`
            : message;

        const persistTranscript = async (assistantContent: string, thoughtSteps: StoredThoughtStep[]) => {
            await appendMessagesToSession(sessionId, userId, [
                { id: crypto.randomUUID(), role: "user", content: message, timestamp: requestStartedAt },
                {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: assistantContent,
                    thoughtSteps: thoughtSteps.length ? thoughtSteps : undefined,
                    timestamp: Date.now(),
                },
            ], model);
        };

        if (!stream) {
            let lastError = "";
            const collector = createTranscriptCollector();

            const generator = runAgent(
                userId,
                sessionId,
                fullMessage,
                contextFileId,
                contextContent,
                undefined,
                history,
                model,
                { reasoningEffort, autoFixErrors }
            );

            for await (const event of generator) {
                collector.collect(event);
                if (event.type === "error") {
                    lastError = event.message;
                }
            }

            const { assistantContent, thoughtSteps } = collector.snapshot();
            await persistTranscript(assistantContent, thoughtSteps);

            if (lastError && !assistantContent) {
                throw ApiErrors.internalError(lastError);
            }

            if (!assistantContent) {
                throw ApiErrors.internalError("AI returned an empty response. Please try again.");
            }

            return NextResponse.json({ reply: assistantContent, sessionId, title: chatSession.title });
        }

        const encoder = new TextEncoder();
        const responseStream = new ReadableStream({
            async start(controller) {
                const collector = createTranscriptCollector();
                try {
                    controller.enqueue(encoder.encode(serializeAgentEvent({
                        type: "session_meta",
                        sessionId,
                        title: chatSession.title,
                    })));

                    const sendStateChange = (state: string, tool?: string) => {
                        const event = {
                            type: "state_change" as const,
                            state,
                            tool,
                            timestamp: Date.now(),
                        };
                        controller.enqueue(encoder.encode(serializeAgentEvent(event)));
                    };

                    const generator = runAgent(
                        userId,
                        sessionId,
                        fullMessage,
                        contextFileId,
                        contextContent,
                        sendStateChange,
                        history,
                        model,
                        { reasoningEffort, autoFixErrors }
                    );

                    for await (const event of generator) {
                        collector.collect(event);
                        controller.enqueue(encoder.encode(serializeAgentEvent(event)));
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Streaming failed";
                    const event = { type: "error" as const, message: errorMessage };
                    collector.collect(event);
                    try {
                        controller.enqueue(encoder.encode(serializeAgentEvent(event)));
                    } catch {
                        // Stream already closed by the client — still persist below.
                    }
                } finally {
                    const { assistantContent, thoughtSteps } = collector.snapshot();
                    await persistTranscript(assistantContent, thoughtSteps);
                    try {
                        controller.close();
                    } catch {
                        // Already closed.
                    }
                }
            },
        });

        return new NextResponse(responseStream, {
            headers: {
                "Content-Type": "application/x-ndjson",
                "Cache-Control": "no-cache",
                "X-Chat-Session-Id": sessionId,
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}
