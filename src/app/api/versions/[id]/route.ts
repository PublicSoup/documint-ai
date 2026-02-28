import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        id: z.string().trim().min(1).max(100),
    })
    .strict();

async function parseVersionId(params: Promise<{ id: string }>): Promise<string> {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
        throw ApiErrors.badRequest("Invalid version id", parsedParams.error.flatten());
    }

    return parsedParams.data.id;
}

// POST: rollback to a specific version
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const versionId = await parseVersionId(props.params);

        const version = await db.docVersion.findUnique({
            where: { id: versionId },
            include: {
                documentation: {
                    include: { file: true },
                },
            },
        });

        if (!version) {
            throw ApiErrors.notFound("Version");
        }

        const canEdit = await checkFilePermission(session.user.id, version.documentation.fileId, "edit");
        if (!canEdit) {
            throw ApiErrors.forbidden("Access denied");
        }

        await db.$transaction(async (tx) => {
            const latestVersion = await tx.docVersion.findFirst({
                where: { documentationId: version.documentationId },
                orderBy: { version: "desc" },
            });

            await tx.docVersion.create({
                data: {
                    documentationId: version.documentationId,
                    content: version.documentation.content,
                    version: (latestVersion?.version || 0) + 1,
                    message: `Auto-saved before rollback to v${version.version}`,
                    createdById: session.user.id,
                },
            });

            await tx.documentation.update({
                where: { id: version.documentationId },
                data: {
                    content: version.content,
                    status: "DRAFT",
                    verifiedAt: null,
                    verifiedById: null,
                },
            });
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: "ROLLBACK",
                entity: "Documentation",
                entityId: version.documentationId,
                userId: session.user.id,
                details: {
                    versionId,
                    versionNumber: version.version,
                    fileName: version.documentation.file.name,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            success: true,
            message: `Rolled back to version ${version.version}`,
            rolledBackVersion: version.version,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

// GET: fetch one version with permissions
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const id = await parseVersionId(props.params);

        const version = await db.docVersion.findUnique({
            where: { id },
            include: {
                documentation: {
                    include: { file: true },
                },
            },
        });

        if (!version) {
            throw ApiErrors.notFound("Version");
        }

        const canView = await checkFilePermission(session.user.id, version.documentation.fileId, "view");
        if (!canView) {
            throw ApiErrors.forbidden("Access denied");
        }

        return NextResponse.json({
            version,
            fileName: version.documentation.file.name,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
