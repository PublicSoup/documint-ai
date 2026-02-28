import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody, validateQuery } from "@/lib/api-utils";

const getVersionsQuerySchema = z
    .object({
        fileId: z.string().trim().min(1).max(100),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict();

const createVersionSchema = z
    .object({
        fileId: z.string().trim().min(1).max(100),
        message: z.string().trim().max(500).optional(),
    })
    .strict();

// GET: list versions for a documentation file
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { fileId, limit } = validateQuery(req.nextUrl.searchParams, getVersionsQuerySchema);

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            throw ApiErrors.forbidden("Access denied");
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file?.documentation) {
            throw ApiErrors.notFound("Documentation");
        }

        const versions = await db.docVersion.findMany({
            where: { documentationId: file.documentation.id },
            orderBy: { version: "desc" },
            take: limit,
        });

        return NextResponse.json({
            versions,
            currentVersion: versions[0]?.version || 1,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

// POST: create a new manual version snapshot
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { fileId, message } = await validateBody(req, createVersionSchema);

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            throw ApiErrors.forbidden("Access denied");
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file?.documentation) {
            throw ApiErrors.notFound("Documentation");
        }

        const version = await db.$transaction(async (tx) => {
            const latestVersion = await tx.docVersion.findFirst({
                where: { documentationId: file.documentation!.id },
                orderBy: { version: "desc" },
            });

            const nextVersion = (latestVersion?.version || 0) + 1;

            return tx.docVersion.create({
                data: {
                    documentationId: file.documentation!.id,
                    content: file.documentation!.content,
                    version: nextVersion,
                    message: message || `Version ${nextVersion}`,
                    createdById: session.user.id,
                },
            });
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: "SNAPSHOT",
                entity: "Documentation",
                entityId: file.documentation.id,
                userId: session.user.id,
                details: {
                    fileId,
                    fileName: file.name,
                    version: version.version,
                    manual: true,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            version,
            message: `Created version ${version.version}`,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
