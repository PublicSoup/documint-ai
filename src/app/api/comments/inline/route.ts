import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET: Get comments for a file with highlight positions
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            return NextResponse.json({ error: "fileId required" }, { status: 400 });
        }

        const comments = await db.comment.findMany({
            where: {
                fileId,
                parentId: null // Only top-level comments
            },
            include: {
                user: { select: { name: true, image: true } },
                replies: {
                    include: {
                        user: { select: { name: true, image: true } }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ comments });

    } catch (error) {
        console.error("Get Comments Error:", error);
        return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
    }
}

// POST: Create inline comment with highlight info
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { fileId, content, parentId, highlight } = await req.json();
        // highlight: { startLine, endLine, startChar, endChar, selectedText }

        if (!fileId || !content) {
            return NextResponse.json({ error: "fileId and content required" }, { status: 400 });
        }

        // Verify file access
        const file = await db.file.findFirst({
            where: { id: fileId, userId: session.user.id }
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Create comment with highlight metadata in content (JSON encoded)
        const commentData = {
            content: highlight ? JSON.stringify({ text: content, highlight }) : content,
            userId: session.user.id,
            fileId,
            parentId: parentId || null
        };

        const comment = await db.comment.create({
            data: commentData,
            include: {
                user: { select: { name: true, image: true } }
            }
        });

        // Create notification for file owner if different user
        if (file.userId && file.userId !== session.user.id) {
            await db.notification.create({
                data: {
                    userId: file.userId,
                    type: "MENTION",
                    message: `${session.user.name || "Someone"} commented on ${file.name}`,
                    link: `/dashboard?file=${fileId}`
                }
            });
        }

        return NextResponse.json({ comment });

    } catch (error) {
        console.error("Create Comment Error:", error);
        return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }
}
