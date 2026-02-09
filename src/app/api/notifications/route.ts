import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveUserId } from "@/lib/resolve-user";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const notifications = await db.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 20
        });

        // Also count unread
        const unreadCount = await db.notification.count({
            where: { userId, read: false }
        });

        return NextResponse.json({ notifications, unreadCount });
    } catch (error) {
        console.error("Notifications fetch error:", error);
        // Fallback to empty notifications instead of 500
        return NextResponse.json({ notifications: [], unreadCount: 0 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const body = await req.json();
        const { id, readAll } = body;

        if (readAll) {
            await db.notification.updateMany({
                where: { userId, read: false },
                data: { read: true }
            });
        } else if (id) {
            await db.notification.update({
                where: { id, userId },
                data: { read: true }
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
