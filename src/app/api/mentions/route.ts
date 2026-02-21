import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit } from "@/lib/rate-limit";

const mentionPostSchema = z.object({
    text: z.string().max(10_000),
    contextType: z.enum(["comment", "review", "documentation"]),
    contextId: z.string().min(1).optional(),
    contextName: z.string().min(1).max(255).optional(),
}).strict();

const mentionSearchSchema = z.object({
    q: z.string().trim().min(2).max(100),
    limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict();

// POST: process mentions in text and create notifications
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = mentionPostSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid mention payload" }, { status: 400 });
        }

        const { text, contextType, contextId, contextName } = parsed.data;

        if (!text.trim()) {
            return NextResponse.json({ mentions: [], notificationsSent: 0 });
        }

        const mentionPattern = /@([a-zA-Z0-9_]+)/g;
        const mentions = [...text.matchAll(mentionPattern)].map((match) => match[1].toLowerCase());
        const uniqueMentions = Array.from(new Set(mentions));

        if (uniqueMentions.length === 0) {
            return NextResponse.json({ mentions: [], notificationsSent: 0 });
        }

        const searchClauses = uniqueMentions.flatMap((mention) => [
            { name: { contains: mention, mode: "insensitive" as const } },
            { email: { startsWith: `${mention}@`, mode: "insensitive" as const } },
        ]);

        const users = await db.user.findMany({
            where: { OR: searchClauses },
            select: { id: true, name: true, email: true },
            take: 25,
        });

        let notificationsSent = 0;
        for (const user of users) {
            if (user.id === session.user.id) continue;

            await sendNotification({
                userId: user.id,
                type: "MENTION",
                title: "You were mentioned",
                message: `**${session.user.name || "Someone"}** mentioned you in ${contextName || contextType}`,
                link:
                    contextType === "comment"
                        ? `/dashboard?docId=${contextId || ""}#comments`
                        : `/dashboard/${contextType}s/${contextId || ""}`,
            });
            notificationsSent += 1;
        }

        return NextResponse.json({
            mentions: users.map((user) => user.name || user.email),
            notificationsSent,
        });
    } catch (error) {
        console.error("Mention process error:", error);
        return NextResponse.json({ error: "Failed to process mentions" }, { status: 500 });
    }
}

// GET: search users for mention autocomplete
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = mentionSearchSchema.safeParse({
            q: new URL(req.url).searchParams.get("q") ?? "",
            limit: new URL(req.url).searchParams.get("limit") ?? 10,
        });

        if (!parsed.success) {
            return NextResponse.json({ users: [] });
        }

        const { q: query, limit } = parsed.data;

        const teamMemberships = await db.teamMember.findMany({
            where: { userId: session.user.id },
            select: { teamId: true },
        });

        const teamIds = teamMemberships.map((membership) => membership.teamId);

        const users = await db.user.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { name: { contains: query, mode: "insensitive" } },
                            { email: { contains: query, mode: "insensitive" } },
                        ],
                    },
                    teamIds.length > 0
                        ? {
                              teamMembers: {
                                  some: {
                                      teamId: { in: teamIds },
                                  },
                              },
                          }
                        : {
                              id: session.user.id,
                          },
                ],
            },
            select: { id: true, name: true, image: true },
            take: limit,
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error("Mention search error:", error);
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
}
