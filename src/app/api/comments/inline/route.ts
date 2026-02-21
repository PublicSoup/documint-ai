import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

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

// GET: inline/top-level comments with highlight metadata
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = inlineQuerySchema.safeParse({
            fileId: new URL(req.url).searchParams.get("fileId") ?? "",
        });

        if (!parsedQuery.success) {
            return NextResponse.json({ error: "fileId required" }, { status: 400 });
        }

        const { fileId } = parsedQuery.data;

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

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
        console.error("Get inline comments error:", error);
        return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
    }
}

// POST: create inline comment with optional highlight metadata
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = createInlineCommentSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid inline comment payload" }, { status: 400 });
        }

        const { fileId, content, parentId, highlight } = parsed.data;

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, userId: true, name: true, teamId: true },
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

        const encodedContent = highlight
            ? JSON.stringify({ text: content, highlight })
            : content;

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
        console.error("Create inline comment error:", error);
        return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }
}
