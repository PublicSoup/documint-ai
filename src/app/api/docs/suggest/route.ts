import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { getAICompletion } from "@/lib/ai";
import { parseCode } from "@/lib/parsing/tree-sitter";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeJsonParse } from "@/lib/utils";
import { checkFilePermission } from "@/lib/permissions";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const suggestBodySchema = z.object({
    fileId: z.string().trim().min(1).max(100),
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

/**
 * POST /api/docs/suggest
 * Analyzes a document and its associated code to provide AI-powered improvement suggestions.
 */
export async function POST(request: NextRequest) {
    const gateError = await requireFeature("smartSuggestions");
    if (gateError) return gateError;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const { fileId } = await validateBody(request, suggestBodySchema);

        // 2. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "view");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to view suggestions for this file."));
        }

        // 3. Fetch file and documentation
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file) {
            return errorResponse(ApiErrors.notFound("File"));
        }

        const suggestions: Suggestion[] = [];

        // 4. Heuristic Drift Check
        if (file.documentation) {
            const fileUpdated = new Date(file.updatedAt).getTime();
            const docUpdated = new Date(file.documentation.updatedAt).getTime();
            
            // If code was updated >5 mins after documentation
            if (fileUpdated > docUpdated + 5 * 60 * 1000) {
                const doc = safeJsonParse<DocContent>(file.documentation.content, {});
                const metadata = (file.documentation.metadata as DocMetadata | null) || {};
                const hasProposed = Boolean(metadata.proposedContent);

                let driftAnalysis = "Source code was updated after the last documentation generation. Re-run analysis to bring them back in sync.";

                if (hasProposed) {
                    driftAnalysis = "An AI-prepared draft is already available to resolve this drift. Review and apply the update.";
                } else {
                    try {
                        const aiPrompt = `Code was updated. Current doc summary: "${doc.summary?.slice(0, 150) || "N/A"}".\nCode Preview: \`\`\`\n${(file.content || "").slice(0, 2000)}\n\`\`\`\nBriefly identify the primary documentation gap caused by recent changes in one concise sentence.`;

                        const aiResult = await getAICompletion(
                            [
                                { role: "system", content: "You are a code drift analyst. Be concise and technical." },
                                { role: "user", content: aiPrompt },
                            ],
                            { temperature: 0.2 }
                        );

                        if (aiResult?.content) {
                            driftAnalysis = aiResult.content.trim();
                        }
                    } catch {
                        // Fail gracefully
                    }
                }

                suggestions.push({
                    type: "drift",
                    severity: "high",
                    message: "Documentation out of sync",
                    suggestion: driftAnalysis,
                });
            }
        }

        // 5. Documentation Quality Heuristics
        if (file.documentation?.content) {
            const doc = safeJsonParse<DocContent>(file.documentation.content, {});

            if (doc.entities) {
                doc.entities.forEach((entity) => {
                    if (!entity.doc || entity.doc.length < 20) {
                        suggestions.push({
                            type: "missing",
                            severity: "high",
                            entity: entity.name,
                            message: `${entity.type} \`${entity.name}\` documentation is too brief or missing`,
                            suggestion: `Provide detailed technical documentation for ${entity.name}, covering parameters and expected behavior.`,
                        });
                    }

                    if (entity.type === "function" && !entity.example) {
                        suggestions.push({
                            type: "example",
                            severity: "medium",
                            entity: entity.name,
                            message: `No usage example found for \`${entity.name}\``,
                            suggestion: "Add a practical code example demonstrating how to use this function.",
                        });
                    }

                    if (entity.doc?.includes("TODO") || entity.doc?.includes("FIXME")) {
                        suggestions.push({
                            type: "clarity",
                            severity: "medium",
                            entity: entity.name,
                            message: `Found placeholder (TODO/FIXME) in \`${entity.name}\` docs`,
                            suggestion: "Finalize implementation notes and remove placeholders.",
                        });
                    }
                });
            }

            if (!doc.summary || doc.summary.length < 50) {
                suggestions.push({
                    type: "missing",
                    severity: "high",
                    message: "File summary is missing or insufficient",
                    suggestion: "Add a high-level summary explaining the architectural role of this module.",
                });
            }

            if (doc.qualityScore && doc.qualityScore < 70) {
                suggestions.push({
                    type: "improvement",
                    severity: "medium",
                    message: `Documentation quality score is sub-optimal (${doc.qualityScore}%)`,
                    suggestion: "Increase documentation depth for core logical entities.",
                });
            }

            // 6. AST-based Missing Entity Detection
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
                                suggestion: "Re-generate documentation or manually add this entity to include it in the reference.",
                            });
                        }
                    });
                } catch {
                    // AST failures shouldn't block the API
                }
            }
        } else {
            suggestions.push({
                type: "missing",
                severity: "high",
                message: "No documentation found",
                suggestion: "Run AI Analysis to generate initial documentation for this file.",
            });
        }

        // 7. Dynamic AI Suggestions (if low count)
        if (file.documentation?.content && suggestions.length < 5) {
            try {
                const doc = safeJsonParse<DocContent>(file.documentation.content, {});
                const aiPrompt = `Analyze documentation quality for a ${file.language} module. \nSummary: ${doc.summary?.slice(0, 200) || "N/A"}. \nEntities: ${doc.entities?.length || 0}. \nSuggest two technical improvements to documentation depth or clarity.`;
                const systemPrompt = 'Return ONLY a JSON array of up to 2 suggestions with this shape: [{"type":"improvement","message":"...","suggestion":"...","severity":"low"}]';

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
                    const parsedAiSuggestions = JSON.parse(aiResult.content);
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
                // Non-blocking
            }
        }

        // 8. Final Sort and Response
        const severityOrder: Record<Suggestion["severity"], number> = {
            high: 0,
            medium: 1,
            low: 2,
        };
        suggestions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        // 9. Audit Log
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
        return errorResponse(error);
    }
}
