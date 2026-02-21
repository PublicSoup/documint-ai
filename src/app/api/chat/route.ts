import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { runAgent } from "@/lib/agent/engine";

const historyMessageSchema = z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(10_000),
}).strict();

const chatRequestSchema = z.object({
    message: z.string().trim().min(1).max(8_000),
    history: z.array(historyMessageSchema).max(30).default([]),
    contextFileId: z.string().min(1).max(255).optional(),
    contextContent: z.string().max(50_000).optional(),
    additionalContext: z.string().max(5_000).optional(),
    stream: z.boolean().default(true),
}).strict();

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const limit = await rateLimit(session.user.id, "pro");
        if (limit && !limit.success) {
            return rateLimitResponse(limit.remaining, limit.reset);
        }

        const payload = chatRequestSchema.safeParse(await req.json());
        if (!payload.success) {
            return NextResponse.json({ error: "Invalid chat payload" }, { status: 400 });
        }

        const {
            message,
            history,
            contextFileId,
            contextContent,
            additionalContext,
            stream,
        } = payload.data;

        const fullMessage = additionalContext
            ? `${message}\n\nAdditional Context:\n${additionalContext}`
            : message;

        if (!stream) {
            let finalReply = "";
            let lastError = "";

            const generator = runAgent(
                session.user.id,
                fullMessage,
                contextFileId,
                contextContent,
                undefined,
                history,
            );

            for await (const event of generator) {
                if (event.type === "response") {
                    finalReply += event.content;
                } else if (event.type === "error") {
                    lastError = event.message;
                }
            }

            if (lastError && !finalReply) {
                return NextResponse.json({ error: lastError }, { status: 500 });
            }

            if (!finalReply) {
                return NextResponse.json({ error: "AI returned an empty response. Please try again." }, { status: 500 });
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
                        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
                    };

                    const generator = runAgent(
                        session.user.id,
                        fullMessage,
                        contextFileId,
                        contextContent,
                        sendStateChange,
                        history,
                    );

                    for await (const event of generator) {
                        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
                    }
                    controller.close();
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Streaming failed";
                    const event = { type: "error" as const, message: errorMessage };
                    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
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
        console.error("Chat Error:", error);
        return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
    }
}
