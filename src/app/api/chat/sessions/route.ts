import { createApiHandler } from "@/lib/api-utils";
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
export const GET = createApiHandler({
    handler: async ({ userId }) => {
        const sessions = await db.chatSession.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 50,
            select: { id: true, title: true, model: true, messages: true, createdAt: true, updatedAt: true },
        });

        return {
            sessions: sessions.map((chat: SessionRow) => ({
                id: chat.id,
                title: chat.title,
                model: chat.model,
                messageCount: parseStoredMessages(chat.messages).length,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
            })),
        };
    },
});
