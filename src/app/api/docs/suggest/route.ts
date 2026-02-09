import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { getAICompletion } from "@/lib/ai";

import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { safeJsonParse } from "@/lib/utils";

interface Suggestion {
    type: "missing" | "improvement" | "example" | "clarity";
    severity: "low" | "medium" | "high";
    entity?: string;
    message: string;
    suggestion: string;
}

export async function POST(request: NextRequest) {
    try {
        // Check feature access
        const gateError = await requireFeature("smartSuggestions");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Rate limiting (Rule R9)
        const limit = await rateLimit(session.user.id, "pro");
        if (limit && !limit.success) {
            return rateLimitResponse(limit.remaining, limit.reset);
        }

        const { fileId } = await request.json();

        if (!fileId) {
            return NextResponse.json({ error: "File ID required" }, { status: 400 });
        }

        const file = await db.file.findFirst({
            where: { id: fileId, userId: session.user.id },
            include: { documentation: true }
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const suggestions: Suggestion[] = [];

        // Analyze existing documentation
        if (file.documentation?.content) {
            try {
                const doc = safeJsonParse(file.documentation.content, {} as any);

                // Check for missing documentation
                if (doc.entities) {
                    doc.entities.forEach((entity: any) => {
                        // Check for empty/short docs
                        if (!entity.doc || entity.doc.length < 20) {
                            suggestions.push({
                                type: "missing",
                                severity: "high",
                                entity: entity.name,
                                message: `${entity.type} \`${entity.name}\` lacks documentation`,
                                suggestion: `Add a description explaining what ${entity.name} does, its parameters, and return value`
                            });
                        }

                        // Check for missing examples
                        if (entity.type === "function" && !entity.example) {
                            suggestions.push({
                                type: "example",
                                severity: "medium",
                                entity: entity.name,
                                message: `No usage example for \`${entity.name}\``,
                                suggestion: "Add a code example showing how to call this function"
                            });
                        }

                        // Check for clarity issues
                        if (entity.doc?.includes("TODO") || entity.doc?.includes("FIXME")) {
                            suggestions.push({
                                type: "clarity",
                                severity: "medium",
                                entity: entity.name,
                                message: `Documentation contains TODO/FIXME in \`${entity.name}\``,
                                suggestion: "Complete the documentation or remove placeholder text"
                            });
                        }
                    });
                }

                // Check summary quality
                if (!doc.summary || doc.summary.length < 50) {
                    suggestions.push({
                        type: "missing",
                        severity: "high",
                        message: "File summary is missing or too brief",
                        suggestion: "Add a comprehensive summary explaining the purpose and main functionality of this file"
                    });
                }

                // Check for quality score issues
                if (doc.qualityScore && doc.qualityScore < 70) {
                    suggestions.push({
                        type: "improvement",
                        severity: "medium",
                        message: `Documentation quality score is ${doc.qualityScore}%`,
                        suggestion: "Improve documentation coverage and add more detailed descriptions"
                    });
                }

            } catch { }
        } else {
            suggestions.push({
                type: "missing",
                severity: "high",
                message: "No documentation exists for this file",
                suggestion: "Generate documentation using the 'Regenerate AI' feature"
            });
        }

        // Use AI to suggest additional improvements
        if (file.documentation?.content && suggestions.length < 5) {
            try {
                const doc = safeJsonParse(file.documentation.content, {} as any);
                const aiPrompt = `Analyze docs. Summary: ${doc.summary?.slice(0, 200)}. Entities: ${doc.entities?.length}. Suggest 2 improvements.`;
                const systemPrompt = `You analyze documentation. Return ONLY a JSON array: [{"type": "improvement", "message": "...", "suggestion": "..."}]`;

                // Call centralized Gemini service
                const aiResult = await getAICompletion([
                    { role: "system", content: systemPrompt },
                    { role: "user", content: aiPrompt }
                ], {
                    temperature: 0.3,
                    jsonMode: true
                });

                if (aiResult) {
                    try {
                        const aiSuggestions = JSON.parse(aiResult.content);
                        if (Array.isArray(aiSuggestions)) {
                            aiSuggestions.forEach((s: any) => {
                                if (s.message && s.suggestion) {
                                    suggestions.push({
                                        type: s.type || "improvement",
                                        severity: s.severity || "low",
                                        message: s.message,
                                        suggestion: s.suggestion
                                    });
                                }
                            });
                        }
                    } catch { }
                }
            } catch { }
        }

        // Sort by severity
        const severityOrder = { high: 0, medium: 1, low: 2 };
        suggestions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return NextResponse.json({
            suggestions: suggestions.slice(0, 10),
            score: Math.max(0, 100 - suggestions.length * 10),
            file: { name: file.name, language: file.language }
        });

    } catch (error) {
        console.error("Suggestions error:", error);
        return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
    }
}
