import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({ where: { email: session.user.email } });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const notifications = await db.notification.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // Get unread count
        const unreadCount = await db.notification.count({
            where: { userId: user.id, read: false }
        });

        return NextResponse.json({ notifications, unreadCount });

    } catch (error) {
        console.error("Get notifications error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    // Mark as read
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({ where: { email: session.user.email } });
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { notificationIds } = body; // Array of IDs or "all"

        if (notificationIds === "all") {
            await db.notification.updateMany({
                where: { userId: user.id, read: false },
                data: { read: true }
            });
        } else if (Array.isArray(notificationIds)) {
            await db.notification.updateMany({
                where: {
                    userId: user.id,
                    id: { in: notificationIds }
                },
                data: { read: true }
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
