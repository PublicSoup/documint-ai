import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getAICompletion } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const translateSchema = z.object({
    text: z.string().trim().min(1).max(50_000), // Safety limit
    targetLang: z.string().trim().min(2).max(50),
}).strict();

/**
 * POST /api/translate
 * Translates technical documentation into a target language using AI.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "pro");

        // 2. Validate Body
        const { text, targetLang } = await validateBody(req, translateSchema);

        const systemPrompt = `You are a professional technical translator.
Translate the following technical documentation into ${targetLang}.
Preserve all Markdown formatting, code blocks, and technical terms (variable names, function names) that should not be translated.
Output ONLY the translated markdown.`;

        // 3. AI Translation Call
        const aiResult = await getAICompletion([
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ], {
            temperature: 0.1
        });

        if (!aiResult?.content) {
            return errorResponse(ApiErrors.internalError("Translation failed: No output from AI."));
        }

        // 4. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "TRANSLATE_DOCS",
                entity: "Documentation",
                entityId: session.user.id,
                details: { targetLang, contentLength: text.length },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ translatedText: aiResult.content });

    } catch (error) {
        return errorResponse(error);
    }
}
