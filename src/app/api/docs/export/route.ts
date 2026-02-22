import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeJsonParse } from "@/lib/utils";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

interface ExportedFile {
    name: string;
    language: string | null;
    content: string;
    metadata: Record<string, unknown>;
}

const exportBodySchema = z.object({
    fileIds: z.array(z.string().min(1)).min(1).max(100),
}).strict();

interface ParsedDocumentation {
    summary?: string;
    entities?: Array<{ name?: string; doc?: string }>;
    metadata?: Record<string, unknown>;
}

/**
 * POST /api/docs/export
 * Aggregates documentation for multiple files and returns them in a structured batch.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const { fileIds } = await validateBody(req, exportBodySchema);
        const requestedFileIds = Array.from(new Set(fileIds));

        // 2. Fetch all requested files
        const files = await db.file.findMany({
            where: { id: { in: requestedFileIds } },
            include: { documentation: true },
        });

        const exportData: Record<string, ExportedFile> = {};

        // 3. Process each file with permission checks
        for (const file of files) {
            const canView = await checkFilePermission(session.user.id, file.id, "view");
            if (!canView) {
                continue;
            }

            let content = "No documentation generated.";
            let metadata: Record<string, unknown> = {};

            if (file.documentation?.content) {
                const docJson = safeJsonParse<ParsedDocumentation>(file.documentation.content, {});
                const summary = docJson.summary || "No summary available.";

                const sections = [
                    `# ${file.name}`,
                    "",
                    summary,
                    "",
                ];

                if (Array.isArray(docJson.entities) && docJson.entities.length > 0) {
                    docJson.entities.forEach((entity) => {
                        const entityName = entity.name || "Unnamed Entity";
                        const entityDoc = entity.doc || "No description available.";
                        sections.push(`## ${entityName}`, "", entityDoc, "");
                    });
                }

                content = sections.join("\n").trim();
                metadata = docJson.metadata || {};
            }

            exportData[file.id] = {
                name: file.name,
                language: file.language,
                content,
                metadata,
            };
        }

        // 4. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "EXPORT_DOCS",
                entity: "Documentation",
                entityId: requestedFileIds.join(","),
                details: {
                    requestedCount: requestedFileIds.length,
                    exportedCount: Object.keys(exportData).length,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ files: exportData });
    } catch (error) {
        return errorResponse(error);
    }
}
