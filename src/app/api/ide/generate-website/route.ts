import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { getAICompletionWithDetailedError } from "@/lib/ai";
import { getUserSubscription } from "@/lib/subscription";

const websiteFileSchema = z
    .object({
        name: z.string().trim().min(1).max(180),
        content: z.string().max(250_000),
    })
    .strict();

const websiteRequestSchema = z
    .object({
        prompt: z.string().trim().min(10).max(1500),
        style: z.enum(["saas", "agency", "ecommerce", "portfolio", "blog", "custom"]).default("custom"),
        framework: z.enum(["html", "react-vite"]).default("react-vite"),
        includeAuthPages: z.boolean().default(false),
    })
    .strict();

const aiResponseSchema = z
    .object({
        projectName: z.string().trim().min(1).max(80),
        summary: z.string().trim().min(1).max(500),
        launchChecklist: z.array(z.string().trim().min(3).max(160)).min(3).max(8),
        conversionHooks: z.array(z.string().trim().min(3).max(180)).min(2).max(6),
        files: z.array(websiteFileSchema).min(2).max(20),
    })
    .strict();

function stripCodeFences(value: string): string {
    return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function sanitizeFilePath(input: string): string | null {
    const normalized = input.replace(/\\/g, "/").trim();
    if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\0")) {
        return null;
    }

    if (!/^[a-zA-Z0-9@._\-/]+$/.test(normalized)) {
        return null;
    }

    return normalized;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Feature Gating & Rate Limiting
        const subscription = await getUserSubscription(session.user.id);
        const isPro = subscription.isPro || subscription.isTeam;

        // If not pro, we might want to block or severely limit.
        // For now, let's enforce "pro" rate limit for pro users, and block free users
        // OR allow free users but very strictly. 
        // Let's assume it's a PRO feature to prevent abuse of expensive generation.
        if (!isPro) {
             // Optional: Allow 1 trial generation? 
             // For safety hardening, let's just block or use a very strict limit if we had one.
             // We'll throw Payment Required to drive conversion.
             throw ApiErrors.paymentRequired("Website generation is available on Pro plans.");
        }

        await enforceRateLimit(session.user.id, "pro");

        const payload = await validateBody(req, websiteRequestSchema);

        const systemPrompt = [
            "You are a principal frontend architect generating production-ready starter code.",
            "Return valid JSON only. No markdown fences.",
            "Output shape:",
            '{"projectName":"...","summary":"...","launchChecklist":["..."],"conversionHooks":["..."],"files":[{"name":"...","content":"..."}]}',
            "Requirements:",
            "- Modern, responsive, accessible UI",
            "- Clean semantic HTML",
            "- No placeholder TODO comments",
            "- Keep file count practical and runnable",
            payload.framework === "react-vite"
                ? "- Include package.json + index.html + src/main.tsx + src/App.tsx + src/styles.css"
                : "- Include index.html + style.css + script.js",
        ].join("\n");

        const userPrompt = [
            `Website brief: ${payload.prompt.replace(/[<>]/g, "")}`, // Basic sanitization
            `Style: ${payload.style}`,
            `Framework: ${payload.framework}`,
            `Include auth pages: ${payload.includeAuthPages ? "yes" : "no"}`,
            "If auth pages are requested, include login and signup views and shared styles.",
            "Avoid external APIs and secrets.",
            "Include a launchChecklist with concrete go-live items (analytics, seo, legal, performance, QA).",
            "Include conversionHooks with concise subscription-growth suggestions relevant to the generated site.",
        ].join("\n");

        const aiResult = await getAICompletionWithDetailedError(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            {
                temperature: 0.3,
                maxTokens: 8192,
                jsonMode: true,
            },
        );

        if (!aiResult.success || !aiResult.data) {
            throw ApiErrors.serviceUnavailable(aiResult.error || "Website generator");
        }

        let parsed;
        try {
            parsed = aiResponseSchema.parse(JSON.parse(stripCodeFences(aiResult.data.content)));
        } catch (parseError) {
             console.error("AI Website Gen Parse Error:", parseError);
             throw ApiErrors.internalError("Failed to parse generated project structure.");
        }

        const safeFiles = parsed.files
            .map((file) => {
                const safeName = sanitizeFilePath(file.name);
                if (!safeName) return null;
                // Double check content size per file
                if (file.content.length > 200_000) return null; 
                return {
                    name: safeName,
                    content: file.content,
                };
            })
            .filter((file): file is { name: string; content: string } => Boolean(file));

        if (safeFiles.length < 2) {
            throw ApiErrors.badRequest("Generated output did not contain valid project files");
        }

        // Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GENERATE_WEBSITE_TEMPLATE",
                entity: "IDE",
                entityId: session.user.id,
                details: {
                    framework: payload.framework,
                    style: payload.style,
                    includeAuthPages: payload.includeAuthPages,
                    fileCount: safeFiles.length,
                    checklistCount: parsed.launchChecklist.length,
                    conversionHookCount: parsed.conversionHooks.length,
                },
            });
        } catch {
            // Non-blocking for the generation path.
        }

        return NextResponse.json(
            {
                projectName: parsed.projectName,
                summary: parsed.summary,
                launchChecklist: parsed.launchChecklist,
                conversionHooks: parsed.conversionHooks,
                files: safeFiles,
            },
            { status: 200 },
        );
    } catch (error) {
        return errorResponse(error);
    }
}
