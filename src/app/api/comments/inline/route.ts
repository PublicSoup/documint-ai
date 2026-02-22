import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, validateQuery, ApiErrors } from "@/lib/api-utils";

const highlightSchema = z.object({
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(1),
    startChar: z.number().int().min(0),
    endChar: z.number().int().min(0),
    selectedText: z.string().max(10_000).optional(),
}).strict();

const createInlineCommentSchema = z.object({
    fileId: z.string().min(1),
    content: z.string().trim().min(1).max(5000),
    parentId: z.string().min(1).optional(),
    highlight: highlightSchema.optional(),
}).strict();

const inlineQuerySchema = z.object({
    fileId: z.string().min(1),
}).strict();

/**
 * GET /api/comments/inline?fileId=xxx
 * Lists inline comments for a document, including highlight metadata.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Query
        const { fileId } = validateQuery(req.nextUrl.searchParams, inlineQuerySchema);

        // 3. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "view");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to view comments for this file."));
        }

        // 4. Fetch Comments
        const comments = await db.comment.findMany({
            where: {
                fileId,
                parentId: null,
            },
            include: {
                user: { select: { id: true, name: true, image: true } },
                replies: {
                    include: {
                        user: { select: { id: true, name: true, image: true } },
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ comments });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * POST /api/comments/inline
 * Creates a new inline comment with optional highlight metadata.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Body
        const { fileId, content, parentId, highlight } = await validateBody(req, createInlineCommentSchema);

        // 3. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "view");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to comment on this file."));
        }

        // 4. Fetch file details
        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, userId: true, name: true, teamId: true },
        });

        if (!file) {
            return errorResponse(ApiErrors.notFound("File"));
        }

        if (parentId) {
            const parent = await db.comment.findUnique({
                where: { id: parentId },
                select: { fileId: true },
            });
            if (!parent || parent.fileId !== fileId) {
                return errorResponse(ApiErrors.badRequest("Invalid parent comment reference."));
            }
        }

        const encodedContent = highlight
            ? JSON.stringify({ text: content, highlight })
            : content;

        // 5. Create Comment
        const comment = await db.comment.create({
            data: {
                content: encodedContent,
                userId: session.user.id,
                fileId,
                parentId: parentId || null,
            },
            include: {
                user: { select: { id: true, name: true, image: true } },
            },
        });

        // 6. Trigger Notification
        if (file.userId && file.userId !== session.user.id) {
            await sendNotification({
                userId: file.userId,
                type: "NEW_COMMENT",
                title: "New Inline Comment",
                message: `**${session.user.name || "Someone"}** added an inline comment to **${file.name}**`,
                fileId,
                fileName: file.name,
                teamId: file.teamId || undefined,
            });
        }

        // 7. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_INLINE_COMMENT",
                entity: "Comment",
                entityId: comment.id,
                details: {
                    fileId,
                    hasHighlight: !!highlight,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ comment });
    } catch (error) {
        return errorResponse(error);
    }
}
