import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { isLocalFileId, getLocalFile, updateLocalFile } from "@/lib/local-dev-storage";
import { uploadFile } from "@/lib/supabase/storage";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const editSchema = z
    .object({
        fileId: z.string().trim().min(1).max(100),
        operation: z.enum(["replace", "prepend", "append", "set"]).default("set"),
        content: z.string().max(2_000_000).optional(),
        find: z.string().optional(),
        replaceWith: z.string().optional(),
    })
    .strict();

function applyEditOperation(params: {
    currentContent: string;
    operation: z.infer<typeof editSchema>["operation"];
    content: string;
    find?: string;
    replaceWith: string;
}): string {
    const { currentContent, operation, content, find, replaceWith } = params;

    if (operation === "set") {
        return content;
    }

    if (operation === "prepend") {
        return `${content}${currentContent}`;
    }

    if (operation === "append") {
        return `${currentContent}${content}`;
    }

    if (!find) {
        throw ApiErrors.badRequest("find is required for replace operation");
    }

    return currentContent.replaceAll(find, replaceWith);
}

/**
 * POST /api/code/edit
 * Applies deterministic edits to file content.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { fileId, operation, content = "", find, replaceWith = "" } = await validateBody(req, editSchema);

        // Local dev file flow
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            const local = await getLocalFile(fileId);
            if (!local) {
                throw ApiErrors.notFound("File");
            }

            const nextContent = applyEditOperation({
                currentContent: local.content || "",
                operation,
                content,
                find,
                replaceWith,
            });

            const ok = await updateLocalFile(fileId, nextContent);
            if (!ok) {
                throw ApiErrors.internalError("Failed to update local file");
            }

            return NextResponse.json({ success: true, fileId, size: nextContent.length });
        }

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            throw ApiErrors.forbidden();
        }

        const file = await db.file.findUnique({ where: { id: fileId } });
        if (!file) {
            throw ApiErrors.notFound("File");
        }

        const nextContent = applyEditOperation({
            currentContent: file.content || "",
            operation,
            content,
            find,
            replaceWith,
        });

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

        // Automatic Event-Driven Triggers (Audits & Drift)
        (async () => {
            try {
                const { triggerAutoAudit, triggerDriftDetection } = await import("@/lib/auto-triggers");
                await Promise.all([
                    triggerAutoAudit(fileId, session.user.id),
                    triggerDriftDetection(fileId, session.user.id)
                ]);
            } catch (e) {
                console.error("[AutoTrigger] Trigger execution failed:", e);
            }
        })();

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "EDIT_CODE",
                entity: "File",
                entityId: fileId,
                details: { operation, size: nextContent.length },
            });
        } catch {
            // Keep mutation non-blocking if audit logging fails.
        }

        return NextResponse.json({ success: true, fileId, size: nextContent.length });
    } catch (error) {
        return errorResponse(error);
    }
}
