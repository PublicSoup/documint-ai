import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { parseStoredMessages } from "@/lib/chat-sessions";

const renameSchema = z.object({
    title: z.string().trim().min(1).max(120),
}).strict();

async function requireOwnedSession(sessionUserId: string, chatId: string) {
    const chat = await db.chatSession.findFirst({
        where: { id: chatId, userId: sessionUserId },
        select: { id: true, title: true, model: true, messages: true, createdAt: true, updatedAt: true },
    });
    if (!chat) {
        throw ApiErrors.notFound("Chat session");
    }
    return chat;
}

/** Load one session's full transcript. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const { id } = await params;
        const chat = await requireOwnedSession(session.user.id, id);

        return NextResponse.json({
            id: chat.id,
            title: chat.title,
            model: chat.model,
            messages: parseStoredMessages(chat.messages),
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

/** Rename a session. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const { id } = await params;
        await requireOwnedSession(session.user.id, id);
        const { title } = await validateBody(req, renameSchema);

        const updated = await db.chatSession.update({
            where: { id },
            data: { title },
            select: { id: true, title: true, updatedAt: true },
        });

        return NextResponse.json(updated);
    } catch (error) {
        return errorResponse(error);
    }
}

/** Delete a session and the agent memory attached to it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const { id } = await params;
        await requireOwnedSession(session.user.id, id);

        await db.chatSession.delete({ where: { id } });
        await db.agentState.deleteMany({ where: { sessionId: id, userId: session.user.id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}
