import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { getAICompletion } from "@/lib/ai";
import { parseCode } from "@/lib/parsing/tree-sitter";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { safeJsonParse } from "@/lib/utils";
import { checkFilePermission } from "@/lib/permissions";

const suggestBodySchema = z.object({
    fileId: z.string().min(1),
}).strict();

const aiSuggestionSchema = z.object({
    type: z.enum(["missing", "improvement", "example", "clarity", "drift"]).optional(),
    severity: z.enum(["low", "medium", "high"]).optional(),
    message: z.string().min(1),
    suggestion: z.string().min(1),
}).strict();

interface Suggestion {
    type: "missing" | "improvement" | "example" | "clarity" | "drift";
    severity: "low" | "medium" | "high";
    entity?: string;
    message: string;
    suggestion: string;
}

interface DocContent {
    summary?: string;
    entities?: Array<{
        type: string;
        name: string;
        doc?: string;
        example?: string;
    }>;
    qualityScore?: number;
}

interface DocMetadata {
    proposedContent?: string;
}

export async function POST(request: NextRequest) {
    try {
        const gateError = await requireFeature("smartSuggestions");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const limit = await rateLimit(session.user.id, "pro");
        if (limit && !limit.success) {
            return rateLimitResponse(limit.remaining, limit.reset);
        }

        const parsedBody = suggestBodySchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "File ID required" }, { status: 400 });
        }

        const { fileId } = parsedBody.data;

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const suggestions: Suggestion[] = [];

        if (file.documentation) {
            const fileUpdated = new Date(file.updatedAt).getTime();
            const docUpdated = new Date(file.documentation.updatedAt).getTime();
            if (fileUpdated > docUpdated + 300000) {
                const doc = safeJsonParse<DocContent>(file.documentation.content, {});
                const metadata = (file.documentation.metadata as DocMetadata | null) || {};
                const hasProposed = Boolean(metadata.proposedContent);

                let driftAnalysis =
                    "Source code changed since the last documentation update. Re-run regeneration to sync docs.";

                if (hasProposed) {
                    driftAnalysis =
                        "AI already prepared a draft to resolve this drift. Review and apply the proposed update.";
                } else {
                    try {
                        const aiPrompt = `Code was updated. Current doc summary: "${doc.summary?.slice(0, 150) || "N/A"}".
Code: \`\`\`\n${(file.content || "").slice(0, 2000)}\n\`\`\`
Briefly identify the most important documentation gap in one sentence.`;

                        const aiResult = await getAICompletion(
                            [
                                { role: "system", content: "You are a code drift analyst. Be concise." },
                                { role: "user", content: aiPrompt },
                            ],
                            { temperature: 0.2 }
                        );

                        if (aiResult?.content) {
                            driftAnalysis = aiResult.content.trim();
                        }
                    } catch {
                        // Ignore AI drift helper failures.
                    }
                }

                suggestions.push({
                    type: "drift",
                    severity: "high",
                    message: "Documentation is out of sync with code",
                    suggestion: driftAnalysis,
                });
            }
        }

        if (file.documentation?.content) {
            const doc = safeJsonParse<DocContent>(file.documentation.content, {});

            if (doc.entities) {
                doc.entities.forEach((entity) => {
                    if (!entity.doc || entity.doc.length < 20) {
                        suggestions.push({
                            type: "missing",
                            severity: "high",
                            entity: entity.name,
                            message: `${entity.type} \`${entity.name}\` lacks documentation`,
                            suggestion: `Add details for ${entity.name}, including purpose, parameters, and return behavior.`,
                        });
                    }

                    if (entity.type === "function" && !entity.example) {
                        suggestions.push({
                            type: "example",
                            severity: "medium",
                            entity: entity.name,
                            message: `No usage example for \`${entity.name}\``,
                            suggestion: "Add a concrete usage example for this function.",
                        });
                    }

                    if (entity.doc?.includes("TODO") || entity.doc?.includes("FIXME")) {
                        suggestions.push({
                            type: "clarity",
                            severity: "medium",
                            entity: entity.name,
                            message: `Documentation contains TODO/FIXME in \`${entity.name}\``,
                            suggestion: "Replace placeholders with complete documentation.",
                        });
                    }
                });
            }

            if (!doc.summary || doc.summary.length < 50) {
                suggestions.push({
                    type: "missing",
                    severity: "high",
                    message: "File summary is missing or too brief",
                    suggestion: "Add a concise but complete summary for the file’s responsibilities.",
                });
            }

            if (doc.qualityScore && doc.qualityScore < 70) {
                suggestions.push({
                    type: "improvement",
                    severity: "medium",
                    message: `Documentation quality score is ${doc.qualityScore}%`,
                    suggestion: "Improve coverage and increase detail depth for key entities.",
                });
            }

            if (file.content) {
                try {
                    const parsedEntities = await parseCode(file.content, file.language || "text");
                    const documentedNames = new Set(doc.entities?.map((entity) => entity.name) || []);

                    parsedEntities.forEach((entity) => {
                        if (!documentedNames.has(entity.name)) {
                            suggestions.push({
                                type: "missing",
                                severity: "medium",
                                entity: entity.name,
                                message: `Detected undocumented ${entity.type} \`${entity.name}\``,
                                suggestion: "Document this entity or run AI regeneration to include it.",
                            });
                        }
                    });
                } catch {
                    // Parser failures should not fail suggestions.
                }
            }
        } else {
            suggestions.push({
                type: "missing",
                severity: "high",
                message: "No documentation exists for this file",
                suggestion: "Generate documentation with the Regenerate AI action.",
            });
        }

        if (file.documentation?.content && suggestions.length < 5) {
            try {
                const doc = safeJsonParse<DocContent>(file.documentation.content, {});
                const aiPrompt = `Analyze docs quality. Summary: ${doc.summary?.slice(0, 200) || "N/A"}. Entity count: ${doc.entities?.length || 0}. Suggest two high-value improvements.`;
                const systemPrompt =
                    'Return ONLY a JSON array: [{"type":"improvement","message":"...","suggestion":"..."}]';

                const aiResult = await getAICompletion(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: aiPrompt },
                    ],
                    {
                        temperature: 0.3,
                        jsonMode: true,
                    }
                );

                if (aiResult?.content) {
                    const parsedAiSuggestions = JSON.parse(aiResult.content) as unknown;
                    if (Array.isArray(parsedAiSuggestions)) {
                        parsedAiSuggestions.forEach((candidate) => {
                            const parsedSuggestion = aiSuggestionSchema.safeParse(candidate);
                            if (parsedSuggestion.success) {
                                suggestions.push({
                                    type: parsedSuggestion.data.type || "improvement",
                                    severity: parsedSuggestion.data.severity || "low",
                                    message: parsedSuggestion.data.message,
                                    suggestion: parsedSuggestion.data.suggestion,
                                });
                            }
                        });
                    }
                }
            } catch {
                // Non-critical AI enhancement failure.
            }
        }

        const severityOrder: Record<Suggestion["severity"], number> = {
            high: 0,
            medium: 1,
            low: 2,
        };
        suggestions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GENERATE_SUGGESTIONS",
                entity: "File",
                entityId: fileId,
                details: { suggestionCount: suggestions.length },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            suggestions: suggestions.slice(0, 10),
            score: Math.max(0, 100 - suggestions.length * 10),
            file: { name: file.name, language: file.language },
        });
    } catch (error) {
        console.error("Suggestions error:", error);
        return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
    }
}
