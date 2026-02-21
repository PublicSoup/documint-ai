import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

const notificationsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

const patchNotificationsSchema = z
    .object({
        id: z.string().min(1).optional(),
        all: z.boolean().optional(),
        readAll: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Boolean(value.id || value.all || value.readAll), {
        message: "id or all/readAll is required",
    });

const deleteNotificationsQuerySchema = z.object({
    id: z.string().min(1),
}).strict();

/**
 * GET /api/notifications
 * Fetch current user's notifications.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = notificationsQuerySchema.safeParse({
            limit: new URL(req.url).searchParams.get("limit") ?? 20,
        });
        if (!parsedQuery.success) {
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
        }

        const { limit } = parsedQuery.data;

        const [notifications, unreadCount] = await Promise.all([
            db.notification.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: "desc" },
                take: limit,
            }),
            db.notification.count({
                where: { userId: session.user.id, read: false },
            }),
        ]);

        return NextResponse.json({ notifications, unreadCount });
    } catch (error) {
        console.error("[Notifications_GET] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * PATCH /api/notifications
 * Mark one or all notifications as read.
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedBody = patchNotificationsSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { id, all, readAll } = parsedBody.data;

        if (all || readAll) {
            await db.notification.updateMany({
                where: { userId: session.user.id, read: false },
                data: { read: true },
            });
        } else if (id) {
            await db.notification.updateMany({
                where: { id, userId: session.user.id },
                data: { read: true },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Notifications_PATCH] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * DELETE /api/notifications
 * Delete one notification by id.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = deleteNotificationsQuerySchema.safeParse({
            id: new URL(req.url).searchParams.get("id") ?? "",
        });
        if (!parsedQuery.success) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        const { id } = parsedQuery.data;

        await db.notification.deleteMany({
            where: { id, userId: session.user.id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Notifications_DELETE] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
