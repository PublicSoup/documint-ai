import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { isLocalFileId, getLocalFile, updateLocalFile } from "@/lib/local-dev-storage";
import { uploadFile } from "@/lib/supabase/storage";

const editSchema = z.object({
    fileId: z.string().min(1),
    operation: z.enum(["replace", "prepend", "append", "set"]).default("set"),
    content: z.string().optional(),
    find: z.string().optional(),
    replaceWith: z.string().optional(),
}).strict();

/**
 * POST /api/code/edit
 * Applies deterministic edits to file content.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = editSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileId, operation, content = "", find, replaceWith = "" } = parsed.data;

        // Local dev file flow
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            const local = await getLocalFile(fileId);
            if (!local) return NextResponse.json({ error: "File not found" }, { status: 404 });

            let nextContent = local.content || "";
            if (operation === "set") {
                nextContent = content;
            } else if (operation === "prepend") {
                nextContent = `${content}${nextContent}`;
            } else if (operation === "append") {
                nextContent = `${nextContent}${content}`;
            } else {
                if (!find) {
                    return NextResponse.json({ error: "find is required for replace operation" }, { status: 400 });
                }
                nextContent = nextContent.replaceAll(find, replaceWith);
            }

            const ok = await updateLocalFile(fileId, nextContent);
            if (!ok) return NextResponse.json({ error: "Failed to update file" }, { status: 500 });

            return NextResponse.json({ success: true, fileId, size: nextContent.length });
        }

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const file = await db.file.findUnique({ where: { id: fileId } });
        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        let nextContent = file.content || "";
        if (operation === "set") {
            nextContent = content;
        } else if (operation === "prepend") {
            nextContent = `${content}${nextContent}`;
        } else if (operation === "append") {
            nextContent = `${nextContent}${content}`;
        } else {
            if (!find) {
                return NextResponse.json({ error: "find is required for replace operation" }, { status: 400 });
            }
            nextContent = nextContent.replaceAll(find, replaceWith);
        }

        await db.file.update({
            where: { id: fileId },
            data: {
                content: nextContent,
                size: nextContent.length,
                updatedAt: new Date(),
            },
        });

        if (file.storagePath) {
            await uploadFile(file.storagePath, nextContent);
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "EDIT_CODE",
                entity: "File",
                entityId: fileId,
                details: { operation, size: nextContent.length },
            });
        } catch {}

        return NextResponse.json({ success: true, fileId, size: nextContent.length });
    } catch (error) {
        console.error("[CodeEdit_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
