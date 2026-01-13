import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const commentSchema = z.object({
    content: z.string().min(1, "Comment cannot be empty"),
    fileId: z.string(),
    parentId: z.string().optional(),
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            // Fallback if session.user.id is missing (should be there due to custom session callback)
            if (session?.user?.email) {
                const user = await db.user.findUnique({ where: { email: session.user.email } });
                if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
                // @ts-ignore
                session.user.id = user.id;
            } else {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const body = await req.json();
        const { content, fileId, parentId } = commentSchema.parse(body);

        // Verify access to the file
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { team: { include: { members: true } } }
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Check permissions
        const isOwner = file.userId === session.user.id;
        let hasAccess = isOwner;

        if (!hasAccess && file.teamId) {
            // Check if user is in team
            const isMember = file.team?.members.some(m => m.userId === session.user.id);
            if (isMember) hasAccess = true;
        }

        if (!hasAccess) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Create comment
        const comment = await db.comment.create({
            data: {
                content,
                fileId,
                userId: session.user.id,
                parentId
            },
            include: {
                user: {
                    select: { name: true, image: true, email: true }
                }
            }
        });

        // Handle Notifications
        // 1. Notify file owner if someone else comments
        if (file.userId !== session.user.id) {
            await db.notification.create({
                data: {
                    userId: file.userId!,
                    type: "COMMENT",
                    message: `${session.user.name || "Someone"} commented on your file "${file.name}"`,
                    link: `/dashboard?docId=${file.id}`,
                }
            });
        }

        // 2. Handle @mentions
        if (file.team && file.team.members) {
            const mentions = content.match(/@([a-zA-Z0-9_]+)/g);
            if (mentions) {
                const mentionedNames = mentions.map(m => m.substring(1).toLowerCase());

                // We initially didn't fetch user names with members, so we need to filter carefully or fetch again.
                // Optimally we updated the initial fetch, but let's just do a rough match or separate query if needed.
                // Let's rely on a separate query to be safe and robust.

                const teamUsers = await db.teamMember.findMany({
                    where: { teamId: file.teamId! },
                    include: { user: true }
                });

                const mentionedUsers = teamUsers.filter(member =>
                    member.userId !== session.user.id && // Don't notify self
                    (member.user.name && mentionedNames.some(name => member.user.name!.toLowerCase().includes(name)))
                );

                for (const member of mentionedUsers) {
                    await db.notification.create({
                        data: {
                            userId: member.userId,
                            type: "MENTION",
                            message: `${session.user.name || "Someone"} mentioned you in "${file.name}"`,
                            link: `/dashboard?docId=${file.id}`,
                        }
                    });
                }
            }
        }

        return NextResponse.json({ comment });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error("Create comment error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            return NextResponse.json({ error: "fileId is required" }, { status: 400 });
        }

        // Access check similar to POST (simplified here, but should be robust)
        const file = await db.file.findUnique({
            where: { id: fileId }
        });

        // Quick owner/team check logic... for GET simplicity we might trust page level access control 
        // BUT strictly we should check again.
        // For now assuming if they can view the page, they can fetch comments. 
        // Implementing strict check:

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // If file has teamId, check membership
        if (file.teamId) {
            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: {
                        teamId: file.teamId,
                        userId: session.user.id
                    }
                }
            });
            if (!membership && file.userId !== session.user.id) { // Not member and not owner
                return NextResponse.json({ error: "Access denied" }, { status: 403 });
            }
        } else {
            // Private file
            if (file.userId !== session.user.id) {
                return NextResponse.json({ error: "Access denied" }, { status: 403 });
            }
        }

        // Fetch comments
        const comments = await db.comment.findMany({
            where: { fileId },
            include: {
                user: {
                    select: { name: true, image: true }
                },
                replies: {
                    include: {
                        user: {
                            select: { name: true, image: true }
                        }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' },
            // Only fetch top-level comments effectively, handling threading on client or recursively here
            // Simplest is to fetch all and arrange on client, or fetch where parentId is null
        });

        // Let's filter for top-level only in the main list, since we include replies
        const topLevelComments = comments.filter((c: { parentId: string | null }) => !c.parentId);

        return NextResponse.json({ comments: topLevelComments });

    } catch (error) {
        console.error("Get comments error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
