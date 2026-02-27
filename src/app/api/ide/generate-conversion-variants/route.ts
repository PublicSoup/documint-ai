import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { getAICompletionWithDetailedError } from "@/lib/ai";

const requestSchema = z
    .object({
        brief: z.string().trim().min(10).max(1500),
        audience: z.string().trim().min(3).max(160).optional(),
        goal: z.enum(["signups", "book-demo", "trial-start", "checkout"]).default("signups"),
    })
    .strict();

const variantSchema = z
    .object({
        id: z.string().trim().min(1).max(40),
        angle: z.string().trim().min(3).max(120),
        headline: z.string().trim().min(8).max(140),
        subheadline: z.string().trim().min(8).max(240),
        cta: z.string().trim().min(2).max(40),
    })
    .strict();

const responseSchema = z
    .object({
        variants: z.array(variantSchema).min(3).max(5),
    })
    .strict();

function stripCodeFences(value: string): string {
    return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "pro");

        const payload = await validateBody(req, requestSchema);

        const systemPrompt = [
            "You are a conversion copywriting strategist for SaaS websites.",
            "Return strict JSON only.",
            'Output shape: {"variants":[{"id":"v1","angle":"...","headline":"...","subheadline":"...","cta":"..."}]}',
            "Generate 3 variants with clearly different angles.",
            "Keep headlines punchy and credible. Avoid hype and fake claims.",
        ].join("\n");

        const userPrompt = [
            `Brief: ${payload.brief}`,
            `Primary goal: ${payload.goal}`,
            `Audience: ${payload.audience ?? "General product teams"}`,
            "Return 3 conversion-oriented hero copy variants suitable for high-intent landing pages.",
        ].join("\n");

        const aiResult = await getAICompletionWithDetailedError(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            {
                temperature: 0.4,
                maxTokens: 2048,
                jsonMode: true,
            },
        );

        if (!aiResult.success || !aiResult.data) {
            throw ApiErrors.serviceUnavailable(aiResult.error || "Conversion variant generator");
        }

        const parsed = responseSchema.parse(JSON.parse(stripCodeFences(aiResult.data.content)));

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GENERATE_CONVERSION_VARIANTS",
                entity: "IDE",
                entityId: session.user.id,
                details: {
                    goal: payload.goal,
                    hasAudience: Boolean(payload.audience),
                    variantCount: parsed.variants.length,
                },
            });
        } catch {
            // Non-blocking.
        }

        return NextResponse.json(parsed);
    } catch (error) {
        return errorResponse(error);
    }
}
