import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { parseStoredMessages } from "@/lib/chat-sessions";
import type { Prisma } from "@prisma/client";

type SessionRow = {
    id: string;
    title: string;
    model: string | null;
    messages: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
};

/** List the caller's IDE chat sessions, newest first. */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        const sessions = await db.chatSession.findMany({
            where: { userId: session.user.id },
            orderBy: { updatedAt: "desc" },
            take: 50,
            select: { id: true, title: true, model: true, messages: true, createdAt: true, updatedAt: true },
        });

        return NextResponse.json({
            sessions: sessions.map((chat: SessionRow) => ({
                id: chat.id,
                title: chat.title,
                model: chat.model,
                messageCount: parseStoredMessages(chat.messages).length,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
            })),
        });
    } catch (error) {
        return errorResponse(error);
    }
}
