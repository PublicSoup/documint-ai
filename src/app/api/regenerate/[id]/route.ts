import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { getAICompletion } from "@/lib/ai";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

const regenerateBodySchema = z.object({
    preview: z.boolean().optional(),
    draft: z.boolean().optional(),
}).strict();

const generatedEntitySchema = z.object({
    type: z.string().min(1),
    name: z.string().min(1),
    code: z.string().optional().default(""),
    doc: z.string().min(1),
    startLine: z.number().int().min(1).optional(),
    endLine: z.number().int().min(1).optional(),
}).strict();

const generatedDocSchema = z.object({
    summary: z.string().min(1),
    entities: z.array(generatedEntitySchema).default([]),
}).strict();

type GeneratedDoc = z.infer<typeof generatedDocSchema>;

/**
 * Robustly parses and validates AI-generated JSON content.
 */
function parseGeneratedDoc(rawContent: string): GeneratedDoc {
    try {
        const jsonMatch =
            rawContent.match(/```json\n?([\s\S]*?)\n?```/) ||
            rawContent.match(/```\n?([\s\S]*?)\n?```/);

        const jsonText = (jsonMatch?.[1] || rawContent || "").trim();
        const parsed = JSON.parse(jsonText) as unknown;

        const validated = generatedDocSchema.safeParse(parsed);
        if (validated.success) {
            return validated.data;
        }
    } catch {
        // Fallback for non-JSON or partial responses
    }

    return {
        summary: rawContent.slice(0, 500) || "Documentation generated.",
        entities: [],
    };
}

/**
 * POST /api/regenerate/[id]
 * Re-runs AI analysis and documentation generation for a specific file.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid file ID", parsedParams.error.flatten());
        }
        const { id: fileId } = parsedParams.data;

        const { preview = false, draft = false } = await validateBody(request, regenerateBodySchema);

        // 2. Check permissions
        const requiredPermission = preview ? "view" : "edit";
        const hasPermission = await checkFilePermission(session.user.id, fileId, requiredPermission);
        if (!hasPermission) {
            throw ApiErrors.forbidden("You do not have permission to regenerate documentation for this file.");
        }

        // 3. Fetch file details
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, name: true, language: true, teamId: true },
        });

        if (!file) {
            throw ApiErrors.notFound("File");
        }

        const content = await getFileContent(fileId);
        if (!content) {
            throw ApiErrors.notFound("File content");
        }

        let styleGuide = "";
        if (file.teamId) {
            const teamConfigRecord = await db.integration.findFirst({
                where: { teamId: file.teamId, type: "TEAM_CONFIG" },
                select: { config: true },
            });
            const config = (teamConfigRecord?.config && typeof teamConfigRecord.config === "object" ? teamConfigRecord.config : {}) as { styleGuide?: string };
            styleGuide = config.styleGuide?.trim() || "";
        }

        // 4. AI Analysis Execution
        const prompt = `You are an expert code documentation assistant.
Analyze this ${file.language || "code"} source file and generate comprehensive documentation.

Return ONLY valid JSON with this exact structure:
{
  "summary": "A concise 2-3 sentence description of what this file does",
  "entities": [
    {
      "type": "function|class|complex_logic",
      "name": "entity name",
      "code": "the actual code snippet",
      "doc": "detailed documentation for this entity",
      "startLine": 1,
      "endLine": 10
    }
  ]
}

${styleGuide ? `STYLE GUIDE INSTRUCTIONS: ${styleGuide}\n` : ""}

CODE:
\`\`\`${file.language || "text"}
${content}
\`\`\``;

        const aiResult = await getAICompletion(
            [
                { role: "system", content: "You are a code documentation expert. Respond only with valid JSON." },
                { role: "user", content: prompt },
            ],
            {
                temperature: 0.1,
                maxTokens: 4096,
                jsonMode: true,
            }
        );

        if (!aiResult?.content) {
            throw ApiErrors.internalError("AI generation failed.");
        }

        const docContent = parseGeneratedDoc(aiResult.content);
        let currentContent: GeneratedDoc | null = null;

        // 5. Update Management
        if (draft) {
            const existingDoc = await db.documentation.findUnique({
                where: { fileId },
                select: { metadata: true },
            });
            const metadata = (existingDoc?.metadata as Record<string, unknown> | null) || {};

            await db.documentation.upsert({
                where: { fileId },
                update: {
                    metadata: {
                        ...metadata,
                        proposedContent: docContent,
                        proposedAt: new Date().toISOString(),
                    } as Prisma.InputJsonValue,
                },
                create: {
                    fileId,
                    content: JSON.stringify(docContent),
                    metadata: {
                        proposedContent: docContent,
                        proposedAt: new Date().toISOString(),
                    } as Prisma.InputJsonValue,
                },
            });
        } else if (!preview) {
            const existingDoc = await db.documentation.findUnique({
                where: { fileId },
                select: { metadata: true },
            });

            const metadata = (existingDoc?.metadata as Record<string, unknown> | null) || {};
            const metadataWithoutProposal = { ...metadata };
            delete metadataWithoutProposal.proposedContent;
            delete metadataWithoutProposal.proposedAt;

            await db.documentation.upsert({
                where: { fileId },
                update: {
                    content: JSON.stringify(docContent),
                    metadata: metadataWithoutProposal as Prisma.InputJsonValue,
                    status: "DRAFT",
                    verifiedAt: null,
                    verifiedById: null,
                },
                create: {
                    fileId,
                    content: JSON.stringify(docContent),
                },
            });
        } else {
            const currentDoc = await db.documentation.findUnique({
                where: { fileId },
                select: { content: true },
            });
            if (currentDoc?.content) {
                try {
                    currentContent = JSON.parse(currentDoc.content) as GeneratedDoc;
                } catch {
                    currentContent = null;
                }
            }
        }

        // 6. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: draft ? "REGENERATE_DOC_DRAFT" : preview ? "PREVIEW_REGENERATE_DOC" : "REGENERATE_DOC",
                entity: "Documentation",
                entityId: fileId,
                details: {
                    fileName: file.name,
                    preview,
                    draft,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            content: docContent,
            currentContent,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
