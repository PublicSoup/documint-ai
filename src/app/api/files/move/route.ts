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
        newName: z.string().trim().min(1).max(255).regex(/^[^/\\\0]+$/, "Invalid file name").optional(),
        targetPath: z
            .string()
            .trim()
            .min(1)
            .max(1024)
            .regex(/^\//, "Path must start with /")
            .regex(/^(\/[^/\\\0]+)+$/, "Invalid path format")
            .refine((path) => !path.includes(".."), "Path traversal detected")
            .optional(),
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
        // If targetPath is provided, use it. Otherwise, if name changed, update path logic (simplified here)
        // Note: storagePath in this system seems to be a virtual path or S3 key.
        // If targetPath is not provided, we preserve the existing directory structure or default to root?
        // The original code was: const resolvedPath = targetPath ?? file.storagePath ?? `/${resolvedName}`;
        // We will keep that logic but ensured inputs are safe.
        const resolvedPath = targetPath ?? file.storagePath ?? `/${resolvedName}`;

        // Check for collision
        const duplicate = await db.file.findFirst({
            where: {
                id: { not: fileId },
                name: resolvedName,
                teamId: file.teamId,
                userId: file.teamId ? undefined : file.userId,
                // Ideally we should also check storagePath uniqueness if that matters,
                // but usually name+scope is the uniqueness constraint for the UI listing.
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
