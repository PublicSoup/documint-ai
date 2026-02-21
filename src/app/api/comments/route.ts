import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const createCommentSchema = z.object({
    content: z.string().trim().min(1).max(5000),
    fileId: z.string().min(1),
    parentId: z.string().min(1).optional(),
}).strict();

const getCommentsQuerySchema = z.object({
    fileId: z.string().min(1),
}).strict();

const updateCommentSchema = z.object({
    id: z.string().min(1),
    content: z.string().trim().min(1).max(5000),
}).strict();

const deleteCommentQuerySchema = z.object({
    id: z.string().min(1),
}).strict();

async function resolveUserId(
    session: { user?: { id?: string | null; email?: string | null } } | null
): Promise<string | null> {
    if (session?.user?.id) return session.user.id;
    if (!session?.user?.email) return null;

    const user = await db.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });

    return user?.id ?? null;
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(userId, "api");

        const parsed = createCommentSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid comment payload" }, { status: 400 });
        }

        const { content, fileId, parentId } = parsed.data;

        const canView = await checkFilePermission(userId, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { team: { include: { members: true } } },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (parentId) {
            const parent = await db.comment.findUnique({
                where: { id: parentId },
                select: { fileId: true },
            });
            if (!parent || parent.fileId !== fileId) {
                return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
            }
        }

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
        console.error("Create comment error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(userId, "api");

        const parsedQuery = getCommentsQuerySchema.safeParse({
            fileId: new URL(req.url).searchParams.get("fileId") ?? "",
        });

        if (!parsedQuery.success) {
            return NextResponse.json({ error: "fileId is required" }, { status: 400 });
        }

        const { fileId } = parsedQuery.data;

        const canView = await checkFilePermission(userId, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

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
        console.error("Get comments error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(userId, "api");

        const parsed = updateCommentSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid comment update payload" }, { status: 400 });
        }

        const { id, content } = parsed.data;

        const comment = await db.comment.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!comment) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        if (comment.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const updated = await db.comment.update({
            where: { id },
            data: { content, updatedAt: new Date() },
        });

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
        console.error("Update comment error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(userId, "api");

        const parsedQuery = deleteCommentQuerySchema.safeParse({
            id: new URL(req.url).searchParams.get("id") ?? "",
        });

        if (!parsedQuery.success) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        const { id } = parsedQuery.data;

        const comment = await db.comment.findUnique({
            where: { id },
            include: { file: true },
        });

        if (!comment) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
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
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await db.comment.delete({ where: { id } });

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
        console.error("Delete comment error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
