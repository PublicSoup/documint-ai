import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const moveSchema = z
    .object({
        fileId: z.string().trim().min(1).max(100),
        newName: z.string().trim().min(1).max(255).optional(),
        targetPath: z.string().trim().min(1).max(1024).optional(),
    })
    .strict();

/**
 * POST /api/files/move
 * Renames and/or moves a file by updating name/storagePath metadata.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { fileId, newName, targetPath } = await validateBody(req, moveSchema);

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            throw ApiErrors.forbidden();
        }

        const file = await db.file.findUnique({ where: { id: fileId } });
        if (!file) {
            throw ApiErrors.notFound("File");
        }

        const resolvedName = newName ?? file.name;
        const resolvedPath = targetPath ?? file.storagePath ?? `/${resolvedName}`;

        const duplicate = await db.file.findFirst({
            where: {
                id: { not: fileId },
                name: resolvedName,
                teamId: file.teamId,
                userId: file.teamId ? undefined : file.userId,
            },
            select: { id: true },
        });

        if (duplicate) {
            throw ApiErrors.conflict("A file with that name already exists");
        }

        const updated = await db.file.update({
            where: { id: fileId },
            data: {
                name: resolvedName,
                storagePath: resolvedPath,
                updatedAt: new Date(),
            },
            select: {
                id: true,
                name: true,
                storagePath: true,
                updatedAt: true,
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "MOVE_FILE",
                entity: "File",
                entityId: fileId,
                details: {
                    oldName: file.name,
                    newName: resolvedName,
                    oldPath: file.storagePath,
                    newPath: resolvedPath,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ success: true, file: updated });
    } catch (error) {
        return errorResponse(error);
    }
}
