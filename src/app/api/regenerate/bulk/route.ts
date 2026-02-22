import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateDocumentationWithContext } from "@/lib/ai";
import { hasFeatureAccess } from "@/lib/subscription";
import { getFileContent } from "@/lib/files";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const bulkRegenerateSchema = z.object({
    fileIds: z.array(z.string().min(1)).min(1).max(100).optional(),
}).strict();

interface RegenerateResult {
    fileId: string;
    name: string;
    success: boolean;
    error?: string;
}

/**
 * POST /api/regenerate/bulk
 * Triggers re-analysis and documentation generation for multiple files.
 * Premium feature.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Feature Gate check
        const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
        if (!hasAccess) {
            return errorResponse(ApiErrors.forbidden("Bulk regeneration requires a Pro plan subscription."));
        }

        const { fileIds } = await validateBody(req, bulkRegenerateSchema);

        // 3. Fetch files with permission-aware filtering
        const files = await db.file.findMany({
            where: {
                ...(fileIds ? { id: { in: fileIds } } : {}),
                OR: [
                    { userId: session.user.id },
                    { team: { members: { some: { userId: session.user.id } } } },
                ],
            },
            select: {
                id: true,
                name: true,
                language: true,
                teamId: true,
            },
            take: 100, // Safety cap
        });

        if (files.length === 0) {
            return errorResponse(ApiErrors.badRequest("No accessible files found to regenerate."));
        }

        const results: RegenerateResult[] = [];

        // 4. Process each file
        for (const file of files) {
            try {
                const canEdit = await checkFilePermission(session.user.id, file.id, "edit");
                if (!canEdit) {
                    results.push({
                        fileId: file.id,
                        name: file.name,
                        success: false,
                        error: "No edit permission",
                    });
                    continue;
                }

                const content = await getFileContent(file.id);
                if (!content) {
                    results.push({
                        fileId: file.id,
                        name: file.name,
                        success: false,
                        error: "Content not found",
                    });
                    continue;
                }

                let styleGuide = "";
                if (file.teamId) {
                    const teamConfigRecord = await db.integration.findFirst({
                        where: { teamId: file.teamId, type: "TEAM_CONFIG" },
                        select: { config: true },
                    });
                    const config = (teamConfigRecord?.config && typeof teamConfigRecord.config === "object" ? teamConfigRecord.config : {}) as { styleGuide?: string };
                    styleGuide = config.styleGuide || "";
                }

                // AI generation call
                const summary = await generateDocumentationWithContext(
                    content.slice(0, 6000),
                    file.language || "text",
                    "file",
                    session.user.id,
                    file.id,
                    [],
                    styleGuide
                );

                // Update documentation record
                await db.documentation.upsert({
                    where: { fileId: file.id },
                    update: {
                        content: JSON.stringify({
                            summary,
                            entities: [],
                            metadata: {
                                regeneratedAt: new Date().toISOString(),
                                bulkOperation: true,
                            },
                        }),
                        status: "DRAFT",
                        verifiedAt: null,
                        verifiedById: null,
                    },
                    create: {
                        fileId: file.id,
                        content: JSON.stringify({
                            summary,
                            entities: [],
                            metadata: {
                                regeneratedAt: new Date().toISOString(),
                                bulkOperation: true,
                            },
                        }),
                    },
                });

                results.push({ fileId: file.id, name: file.name, success: true });
            } catch (error) {
                console.error(`[BulkRegenerate] Failed to regenerate ${file.name}:`, error);
                results.push({
                    fileId: file.id,
                    name: file.name,
                    success: false,
                    error: "Generation failed",
                });
            }
        }

        const successCount = results.filter((result) => result.success).length;

        // 5. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "BULK_REGENERATE_DOCS",
                entity: "Documentation",
                entityId: session.user.id,
                details: {
                    requested: fileIds?.length || "all",
                    processed: files.length,
                    success: successCount,
                    failed: files.length - successCount,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            message: `Regenerated ${successCount}/${files.length} files`,
            results,
            stats: {
                total: files.length,
                success: successCount,
                failed: files.length - successCount,
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}
