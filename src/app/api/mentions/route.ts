import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// POST: Process mentions in text and create notifications
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { text, contextType, contextId, contextName } = await req.json();
        // contextType: "comment", "review", "documentation"
        // contextId: ID of the entity
        // contextName: Human readable name for notification

        if (!text) {
            return NextResponse.json({ mentions: [] });
        }

        // Extract @mentions
        const mentionPattern = /@(\w+)/g;
        const mentions = [...text.matchAll(mentionPattern)].map(m => m[1]);

        if (mentions.length === 0) {
            return NextResponse.json({ mentions: [] });
        }

        // Find users matching the mentions
        const users = await db.user.findMany({
            where: {
                OR: [
                    { name: { in: mentions, mode: 'insensitive' } },
                    { email: { in: mentions.map(m => `${m}@%`), mode: 'insensitive' } }
                ]
            },
            select: { id: true, name: true, email: true }
        });

        // Create notifications for each mentioned user
        const notifications = [];
        for (const user of users) {
            if (user.id === session.user.id) continue; // Don't notify self

            const notification = await db.notification.create({
                data: {
                    userId: user.id,
                    type: "MENTION",
                    message: `${session.user.name || "Someone"} mentioned you in ${contextName || contextType}`,
                    link: contextType === "comment"
                        ? `/dashboard?file=${contextId}#comments`
                        : `/dashboard/${contextType}s/${contextId}`
                }
            });
            notifications.push(notification);
        }

        return NextResponse.json({
            mentions: users.map(u => u.name),
            notificationsSent: notifications.length
        });

    } catch (error) {
        console.error("Mention Process Error:", error);
        return NextResponse.json({ error: "Failed to process mentions" }, { status: 500 });
    }
}

// GET: Search users for autocomplete
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q");

        if (!query || query.length < 2) {
            return NextResponse.json({ users: [] });
        }

        // Search team members if user is in teams
        const teamMemberships = await db.teamMember.findMany({
            where: { userId: session.user.id },
            select: { teamId: true }
        });

        const teamIds = teamMemberships.map(m => m.teamId);

        const users = await db.user.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { name: { contains: query, mode: 'insensitive' } },
                            { email: { contains: query, mode: 'insensitive' } }
                        ]
                    },
                    teamIds.length > 0 ? {
                        teamMembers: { some: { teamId: { in: teamIds } } }
                    } : {}
                ]
            },
            select: { id: true, name: true, image: true },
            take: 10
        });

        return NextResponse.json({ users });

    } catch (error) {
        console.error("User Search Error:", error);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
