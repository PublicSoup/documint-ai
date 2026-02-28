import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAICompletion } from "@/lib/ai";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const regenerateEntitySchema = z
    .object({
        code: z.string().trim().min(1).max(20_000),
        language: z.string().trim().min(1).max(50),
        type: z.enum(["function", "class", "complex_logic", "code"]).default("code"),
        name: z.string().trim().max(255).optional(),
        fileId: z.string().trim().min(1).max(100).optional(),
    })
    .strict();

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { code, language, type, name, fileId } = await validateBody(request, regenerateEntitySchema);

        let styleGuide = "";
        if (fileId) {
            const canView = await checkFilePermission(session.user.id, fileId, "view");
            if (!canView) {
                throw ApiErrors.forbidden();
            }

            const file = await db.file.findUnique({
                where: { id: fileId },
                select: { teamId: true },
            });

            if (file?.teamId) {
                const teamConfig = await db.integration.findFirst({
                    where: { teamId: file.teamId, type: "TEAM_CONFIG" },
                    select: { config: true },
                });
                styleGuide = (teamConfig?.config as { styleGuide?: string } | null)?.styleGuide || "";
            }
        }

        let prompt: string;
        if (type === "function") {
            prompt = `Generate comprehensive documentation for this ${language} function${name ? ` named "${name}"` : ""}.

Include:
- What the function does (purpose)
- Parameters and their types
- Return value
- Important notes or edge cases

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

\`\`\`${language}
${code}
\`\`\`

Documentation:`;
        } else if (type === "class") {
            prompt = `Generate comprehensive documentation for this ${language} class${name ? ` named "${name}"` : ""}.

Include:
- Class purpose and responsibility
- Key methods overview
- How to instantiate and use

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

\`\`\`${language}
${code}
\`\`\`

Documentation:`;
        } else {
            prompt = `Explain this ${language} code block clearly and concisely.

Focus on:
- What the code accomplishes
- Why this approach is used
- Important edge cases or assumptions

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

\`\`\`${language}
${code}
\`\`\`

Explanation:`;
        }

        const aiResult = await getAICompletion(
            [
                {
                    role: "system",
                    content: "You are a code documentation expert. Write clear, helpful documentation.",
                },
                { role: "user", content: prompt },
            ],
            {
                temperature: 0.1,
                maxTokens: 1024,
            },
        );

        if (!aiResult?.content) {
            throw ApiErrors.internalError("AI generation failed");
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "REGENERATE_ENTITY_DOC",
                entity: "Documentation",
                entityId: fileId || session.user.id,
                details: {
                    type,
                    language,
                    hasStyleGuide: Boolean(styleGuide),
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ doc: aiResult.content });
    } catch (error) {
        return errorResponse(error);
    }
}
