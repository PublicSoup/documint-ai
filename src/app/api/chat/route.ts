import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { buildFullCodebaseContext, CHAT_SYSTEM_PROMPT } from "../../../lib/context-builder";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";


const LM_STUDIO_URL = process.env.LM_STUDIO_URL || "http://127.0.0.1:1234";

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

        // Build FULL CODEBASE CONTEXT for comprehensive awareness
        const fullContext = await buildFullCodebaseContext(
            session.user.id,
            contextFileId || "",
            [], // Additional priority files can be added here
            contextContent && contextFileId ? { [contextFileId]: contextContent } : {}
        );

        // Enhanced system prompt
        // R1 - Prompt Minimalism (We keep the structure but ensure content is efficient)
        // R3 - Context Window Management (The builder handles compression logic ideally, but here we construct the final payload)
        const systemPrompt = `${CHAT_SYSTEM_PROMPT}

=== FULL CODEBASE CONTEXT ===
${fullContext}

${additionalContext ? `=== ADDITIONAL UNSAVED CONTEXT ===\n${additionalContext}\n` : ""}
=== END CONTEXT ===

Instructions:
1. Answer strictly based on the provided context.
2. Reference specific files/lines.
3. Be concise and technical (no fluff).
`;

        // Get model
        let modelName = "qwen2.5-coder-7b-instruct";
        try {
            const modelsRes = await fetch(`${LM_STUDIO_URL}/v1/models`);
            if (modelsRes.ok) {
                const mData = await modelsRes.json();
                if (mData.data?.[0]?.id) modelName = mData.data[0].id;
            }
        } catch { }

        const aiRes = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.3,
                max_tokens: 2048
            })
        });

        if (!aiRes.ok) throw new Error("AI Service unavailable");

        const aiData = await aiRes.json();
        const reply = aiData.choices[0].message.content;
        return NextResponse.json({ reply });

    } catch (error) {
        console.error("Chat Error:", error);
        return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
    }
}
