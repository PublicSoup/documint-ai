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

const paramsSchema = z.object({
    id: z.string().min(1),
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

function parseGeneratedDoc(rawContent: string): GeneratedDoc {
    const jsonMatch =
        rawContent.match(/```json\n?([\s\S]*?)\n?```/) ||
        rawContent.match(/```\n?([\s\S]*?)\n?```/);

    const jsonText = (jsonMatch?.[1] || rawContent || "").trim();
    const parsed = JSON.parse(jsonText) as unknown;

    const validated = generatedDocSchema.safeParse(parsed);
    if (validated.success) {
        return validated.data;
    }

    return {
        summary: rawContent.slice(0, 500) || "Documentation generated.",
        entities: [],
    };
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
        }

        const parsedBody = regenerateBodySchema.safeParse(await request.json().catch(() => ({})));
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { id: fileId } = parsedParams.data;
        const { preview = false, draft = false } = parsedBody.data;

        const requiredPermission = preview ? "view" : "edit";
        const hasPermission = await checkFilePermission(session.user.id, fileId, requiredPermission);
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, name: true, language: true, teamId: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const content = await getFileContent(fileId);
        if (!content) {
            return NextResponse.json({ error: "File content not found" }, { status: 404 });
        }

        let styleGuide = "";
        if (file.teamId) {
            const teamConfig = await db.integration.findFirst({
                where: { teamId: file.teamId, type: "TEAM_CONFIG" },
                select: { config: true },
            });
            styleGuide =
                (teamConfig?.config as { styleGuide?: string } | null)?.styleGuide?.trim() || "";
        }

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
            return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
        }

        const docContent = parseGeneratedDoc(aiResult.content);

        let currentContent: GeneratedDoc | null = null;

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
            const { proposedContent, proposedAt, ...metadataWithoutProposal } = metadata;
            void proposedContent;
            void proposedAt;

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
                    const parsedCurrent = parseGeneratedDoc(currentDoc.content);
                    currentContent = parsedCurrent;
                } catch {
                    currentContent = null;
                }
            }
        }

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
        console.error("Regenerate error:", error);
        return NextResponse.json({ error: "Failed to regenerate documentation" }, { status: 500 });
    }
}
