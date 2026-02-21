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

const bulkRegenerateSchema = z.object({
    fileIds: z.array(z.string().min(1)).max(100).optional(),
}).strict();

interface RegenerateResult {
    fileId: string;
    name: string;
    success: boolean;
    error?: string;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
        if (!hasAccess) {
            return NextResponse.json(
                {
                    error: "Bulk regeneration requires Pro plan",
                    upgradeUrl: "/dashboard/settings?tab=billing",
                },
                { status: 403 }
            );
        }

        const parsed = bulkRegenerateSchema.safeParse(await req.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileIds } = parsed.data;

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
            take: fileIds ? Math.min(fileIds.length, 100) : 100,
        });

        if (files.length === 0) {
            return NextResponse.json({ error: "No files to regenerate" }, { status: 400 });
        }

        const results: RegenerateResult[] = [];

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
                    const teamConfig = await db.integration.findFirst({
                        where: { teamId: file.teamId, type: "TEAM_CONFIG" },
                        select: { config: true },
                    });
                    styleGuide =
                        (teamConfig?.config as { styleGuide?: string } | null)?.styleGuide || "";
                }

                const summary = await generateDocumentationWithContext(
                    content.slice(0, 6000),
                    file.language || "text",
                    "file",
                    session.user.id,
                    file.id,
                    [],
                    styleGuide
                );

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
                console.error(`Failed to regenerate ${file.name}:`, error);
                results.push({
                    fileId: file.id,
                    name: file.name,
                    success: false,
                    error: "Generation failed",
                });
            }
        }

        const successCount = results.filter((result) => result.success).length;

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "BULK_REGENERATE_DOCS",
                entity: "Documentation",
                entityId: session.user.id,
                details: {
                    requested: fileIds?.length || null,
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
        console.error("Bulk regenerate error:", error);
        return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 });
    }
}
