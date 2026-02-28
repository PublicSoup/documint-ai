import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, validateQuery, ApiErrors } from "@/lib/api-utils";

const createCommentSchema = z.object({
    content: z.string().trim().min(1).max(5000),
    fileId: z.string().trim().min(1).max(100),
    parentId: z.string().trim().min(1).max(100).optional(),
}).strict();

const getCommentsQuerySchema = z.object({
    fileId: z.string().trim().min(1).max(100),
}).strict();

const updateCommentSchema = z.object({
    id: z.string().trim().min(1).max(100),
    content: z.string().trim().min(1).max(5000),
}).strict();

const deleteCommentQuerySchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

/**
 * POST /api/comments
 * Creates a new comment or reply for a document.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const userId = session.user.id;

        // 1. Enforce Rate Limit
        await enforceRateLimit(userId, "api");

        // 2. Validate Body
        const { content, fileId, parentId } = await validateBody(req, createCommentSchema);

        // 3. Check permissions
        const hasPermission = await checkFilePermission(userId, fileId, "view");
        if (!hasPermission) {
            throw ApiErrors.forbidden("You do not have permission to comment on this file.");
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { team: { include: { members: true } } },
        });

        if (!file) {
            throw ApiErrors.notFound("File");
        }

        if (parentId) {
            const parent = await db.comment.findUnique({
                where: { id: parentId },
                select: { fileId: true },
            });
            if (!parent || parent.fileId !== fileId) {
                throw ApiErrors.badRequest("Invalid parent comment reference.");
            }
        }

        // 4. Create Comment
        const comment = await db.comment.create({
            data: {
                content,
                fileId,
                userId,
                parentId: parentId || null,
            },
            include: {
                user: {
                    select: { id: true, name: true, image: true, email: true },
                },
            },
        });

        const requesterName = session?.user?.name || session?.user?.email || "A developer";

        // 5. Trigger Notifications (Owner and Mentions)
        if (file.userId && file.userId !== userId) {
            await sendNotification({
                userId: file.userId,
                type: "NEW_COMMENT",
                title: "New Documentation Comment",
                message: `**${requesterName}** commented on **${file.name}**:\n\n> ${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`,
                fileId,
                fileName: file.name,
                teamId: file.teamId || undefined,
            });
        }

        if (file.teamId && file.team) {
            const mentions = content.match(/@([a-zA-Z0-9_]+)/g) || [];
            if (mentions.length > 0) {
                const mentionedNames = mentions.map((m) => m.slice(1).toLowerCase());
                const teamUsers = await db.teamMember.findMany({
                    where: { teamId: file.teamId },
                    include: { user: true },
                });

                const mentionedUsers = teamUsers.filter((member) => {
                    if (member.userId === userId) return false;
                    if (member.userId === file.userId) return false;

                    const name = member.user.name?.toLowerCase() || "";
                    const emailPrefix = member.user.email?.split("@")[0]?.toLowerCase() || "";
                    return mentionedNames.some((mention) => name.includes(mention) || emailPrefix === mention);
                });

                await Promise.all(
                    mentionedUsers.map((member) =>
                        sendNotification({
                            userId: member.userId,
                            type: "MENTION",
                            title: "You were mentioned",
                            message: `**${requesterName}** mentioned you in a comment on **${file.name}**`,
                            fileId,
                            fileName: file.name,
                            teamId: file.teamId || undefined,
                        })
                    )
                );
            }
        }

        // 6. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId,
                action: "CREATE_COMMENT",
                entity: "Comment",
                entityId: comment.id,
                details: { fileId, parentId: parentId || null },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ comment });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * GET /api/comments?fileId=xxx
 * Lists all top-level comments and their replies for a file.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const userId = session.user.id;

        // 1. Enforce Rate Limit
        await enforceRateLimit(userId, "api");

        // 2. Validate Query
        const { fileId } = validateQuery(req.nextUrl.searchParams, getCommentsQuerySchema);

        // 3. Check permissions
        const hasPermission = await checkFilePermission(userId, fileId, "view");
        if (!hasPermission) {
            throw ApiErrors.forbidden("You do not have permission to view comments for this file.");
        }

        // 4. Fetch Comments
        const comments = await db.comment.findMany({
            where: { fileId },
            include: {
                user: {
                    select: { id: true, name: true, image: true },
                },
                replies: {
                    include: {
                        user: {
                            select: { id: true, name: true, image: true },
                        },
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        const topLevelComments = comments.filter((comment) => !comment.parentId);
        return NextResponse.json({ comments: topLevelComments });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * PATCH /api/comments
 * Updates the content of an existing comment.
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const userId = session.user.id;

        // 1. Enforce Rate Limit
        await enforceRateLimit(userId, "api");

        // 2. Validate Body
        const { id, content } = await validateBody(req, updateCommentSchema);

        // 3. Check ownership
        const comment = await db.comment.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!comment) {
            throw ApiErrors.notFound("Comment");
        }

        if (comment.userId !== userId) {
            throw ApiErrors.forbidden("You can only edit your own comments.");
        }

        // 4. Update
        const updated = await db.comment.update({
            where: { id },
            data: { content, updatedAt: new Date() },
        });

        // 5. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId,
                action: "UPDATE_COMMENT",
                entity: "Comment",
                entityId: id,
                details: { contentLength: content.length },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ comment: updated });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * DELETE /api/comments?id=xxx
 * Deletes a comment. Owners of the document or team admins can also delete comments.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const userId = session.user.id;

        // 1. Enforce Rate Limit
        await enforceRateLimit(userId, "api");

        // 2. Validate Query
        const { id } = validateQuery(req.nextUrl.searchParams, deleteCommentQuerySchema);

        // 3. Check permissions
        const comment = await db.comment.findUnique({
            where: { id },
            include: { file: true },
        });

        if (!comment) {
            throw ApiErrors.notFound("Comment");
        }

        let canDelete = comment.userId === userId || comment.file.userId === userId;

        if (!canDelete && comment.file.teamId) {
            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: {
                        teamId: comment.file.teamId,
                        userId,
                    },
                },
                select: { role: true },
            });

            if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
                canDelete = true;
            }
        }

        if (!canDelete) {
            throw ApiErrors.forbidden("You do not have permission to delete this comment.");
        }

        // 4. Delete
        await db.comment.delete({ where: { id } });

        // 5. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId,
                action: "DELETE_COMMENT",
                entity: "Comment",
                entityId: id,
                details: { fileId: comment.fileId },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}
