import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUserSubscription } from "@/lib/subscription";
import { runAgent } from "@/lib/agent/engine";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { serializeAgentEvent } from "@/lib/agent/events";
import { AVAILABLE_MODELS } from "@/lib/ai-models";

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
        contextFileId: z.string().min(1).max(255).optional(),
        contextContent: z.string().max(50_000).optional(),
        additionalContext: z.string().max(5_000).optional(),
        model: z.string().optional(),
        reasoningEffort: z.enum(["low", "medium"]).default("low"),
        autoFixErrors: z.boolean().default(true),
        stream: z.boolean().default(true),
    })
    .strict();

const AVAILABLE_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map(model => model.id));

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const subscription = await getUserSubscription(session.user.id);
        const rateLimitTier = (subscription.isPro || subscription.isTeam) ? "pro" : "chat";
        await enforceRateLimit(session.user.id, rateLimitTier);

        const { message, history, contextFileId, contextContent, additionalContext, stream, model, reasoningEffort, autoFixErrors } = await validateBody(req, chatRequestSchema);

        // OpenRouter models are chosen from its live catalog, so the concrete id
        // ("openrouter/<vendor>/<model>") won't be in the static list — allow any
        // well-formed openrouter/* id and let the provider reject unknown models.
        const isOpenRouterModel = typeof model === "string" && /^openrouter\/[\w./:-]+$/.test(model) && model.length <= 200;
        if (model && !AVAILABLE_MODEL_IDS.has(model) && !isOpenRouterModel) {
            throw ApiErrors.badRequest("Unsupported AI model selected.");
        }

        const sessionId = crypto.randomUUID(); // Generate a unique session ID for this agent run

        const fullMessage = additionalContext
            ? `${message}\n\nAdditional Context:\n${additionalContext}`
            : message;

        if (!stream) {
            let finalReply = "";
            let lastError = "";

            const generator = runAgent(
                session.user.id,
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
                if (event.type === "response") {
                    finalReply += event.content;
                } else if (event.type === "error") {
                    lastError = event.message;
                }
            }

            if (lastError && !finalReply) {
                throw ApiErrors.internalError(lastError);
            }

            if (!finalReply) {
                throw ApiErrors.internalError("AI returned an empty response. Please try again.");
            }

            return NextResponse.json({ reply: finalReply });
        }

        const encoder = new TextEncoder();
        const responseStream = new ReadableStream({
            async start(controller) {
                try {
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
                        session.user.id,
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
                        controller.enqueue(encoder.encode(serializeAgentEvent(event)));
                    }
                    controller.close();
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Streaming failed";
                    const event = { type: "error" as const, message: errorMessage };
                    controller.enqueue(encoder.encode(serializeAgentEvent(event)));
                    controller.close();
                }
            },
        });

        return new NextResponse(responseStream, {
            headers: {
                "Content-Type": "application/x-ndjson",
                "Cache-Control": "no-cache",
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}