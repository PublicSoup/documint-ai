import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { runAgent } from "../../../lib/agent/engine";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Rate limiting
        const limit = await rateLimit(session.user.id, "pro");
        if (limit && !limit.success) {
            return rateLimitResponse(limit.remaining, limit.reset);
        }

        const { message, contextFileId, contextContent, additionalContext } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message required" }, { status: 400 });
        }

        const fullMessage = additionalContext ? `${message}\n\nAdditional Context:\n${additionalContext}` : message;

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Create a callback function to send state changes to the client
                    const sendStateChange = (state: string, tool?: string) => {
                        const event = {
                            type: "state_change" as const,
                            state,
                            tool,
                            timestamp: Date.now()
                        };
                        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
                    };

                    const generator = runAgent(
                        session.user.id,
                        fullMessage,
                        contextFileId,
                        contextContent,
                        sendStateChange
                    );

                    for await (const event of generator) {
                        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
                    }
                    controller.close();
                } catch (e) {
                    console.error("Stream Error:", e);
                    controller.error(e);
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "application/x-ndjson",
                "Cache-Control": "no-cache"
            }
        });

    } catch (error) {
        console.error("Chat Error:", error);
        return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
    }
}
