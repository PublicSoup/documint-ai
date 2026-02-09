import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateDocumentationWithContext } from "@/lib/ai";
import { hasFeatureAccess } from "@/lib/subscription";
import { getFileContent } from "@/lib/files";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Premium feature check
        const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
        if (!hasAccess) {
            return NextResponse.json({
                error: "Bulk regeneration requires Pro plan",
                upgradeUrl: "/dashboard/settings?tab=billing"
            }, { status: 403 });
        }

        const { fileIds } = await req.json();

        // Get all user's files if no specific IDs provided
        const files = await db.file.findMany({
            where: {
                userId: session.user.id,
                ...(fileIds ? { id: { in: fileIds } } : {})
            },
            select: {
                id: true,
                name: true,
                content: true,
                language: true
            }
        }) as any[];

        if (files.length === 0) {
            return NextResponse.json({ error: "No files to regenerate" }, { status: 400 });
        }

        const results: { fileId: string; name: string; success: boolean; error?: string }[] = [];

        // Process files with full context awareness
        for (const file of files) {
            try {
                const content = await getFileContent(file.id);
                if (!content) {
                    console.warn(`Skipping ${file.name}: No content found`);
                    results.push({
                        fileId: file.id,
                        name: file.name,
                        success: false,
                        error: "Content not found"
                    });
                    continue;
                }

                // Generate documentation with FULL codebase context
                const summary = await generateDocumentationWithContext(
                    content.substring(0, 4000),
                    file.language,
                    "file",
                    session.user.id,
                    file.id,
                    []
                );

                // Update or create documentation
                await db.documentation.upsert({
                    where: { fileId: file.id },
                    update: {
                        content: JSON.stringify({
                            summary,
                            entities: [],
                            qualityScore: 75,
                            metadata: {
                                regeneratedAt: new Date().toISOString(),
                                bulkOperation: true
                            }
                        })
                    },
                    create: {
                        fileId: file.id,
                        content: JSON.stringify({
                            summary,
                            entities: [],
                            qualityScore: 75,
                            metadata: {
                                regeneratedAt: new Date().toISOString(),
                                bulkOperation: true
                            }
                        })
                    }
                });

                results.push({ fileId: file.id, name: file.name, success: true });
            } catch (error) {
                console.error(`Failed to regenerate ${file.name}:`, error);
                results.push({
                    fileId: file.id,
                    name: file.name,
                    success: false,
                    error: "Generation failed"
                });
            }
        }

        const successCount = results.filter(r => r.success).length;

        return NextResponse.json({
            message: `Regenerated ${successCount}/${files.length} files`,
            results,
            stats: {
                total: files.length,
                success: successCount,
                failed: files.length - successCount
            }
        });

    } catch (error) {
        console.error("Bulk Regenerate Error:", error);
        return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 });
    }
}
