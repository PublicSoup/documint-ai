import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";

const moveSchema = z.object({
    fileId: z.string().min(1),
    newName: z.string().trim().min(1).max(255).optional(),
    targetPath: z.string().trim().min(1).max(1024).optional(),
}).strict();

/**
 * POST /api/files/move
 * Renames and/or moves a file by updating name/storagePath metadata.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = moveSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileId, newName, targetPath } = parsed.data;

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const file = await db.file.findUnique({ where: { id: fileId } });
        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const resolvedName = newName ?? file.name;
        const resolvedPath = targetPath ?? file.storagePath ?? `/${resolvedName}`;

        // Prevent duplicate filename in same scope (personal or team)
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
            return NextResponse.json({ error: "A file with that name already exists" }, { status: 409 });
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
        } catch {}

        return NextResponse.json({ success: true, file: updated });
    } catch (error) {
        console.error("[FileMove_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
