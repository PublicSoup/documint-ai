import { TeamMember, User } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const mentionPostSchema = z.object({
    text: z.string().trim().min(1).max(10_000),
    contextType: z.enum(["comment", "review", "documentation"]),
    contextId: z.string().trim().min(1).max(100).optional(),
    contextName: z.string().trim().min(1).max(255).optional(),
}).strict();

const mentionSearchSchema = z.object({
    q: z.string().trim().min(2).max(100),
    limit: z.coerce.number().int().min(1).max(20).default(10),
}).strict();

const mentionPattern = /@([a-zA-Z0-9_]+)/g;
const MAX_MENTION_TARGETS = 10;

function buildMentionLink(contextType: "comment" | "review" | "documentation", contextId?: string): string {
    const encodedContextId = contextId ? encodeURIComponent(contextId) : "";

    if (contextType === "comment") {
        return encodedContextId ? `/dashboard?docId=${encodedContextId}#comments` : "/dashboard#comments";
    }

    const routeMap: Record<"review" | "documentation", string> = {
        review: "/dashboard/reviews",
        documentation: "/dashboard",
    };

    const baseRoute = routeMap[contextType];
    return encodedContextId ? `${baseRoute}/${encodedContextId}` : baseRoute;
}

function extractMentionHandles(text: string): string[] {
    const mentions = [...text.matchAll(mentionPattern)].map((match) => match[1].toLowerCase());
    return Array.from(new Set(mentions)).slice(0, MAX_MENTION_TARGETS);
}

async function getSharedTeamIds(userId: string): Promise<string[]> {
    const memberships = await db.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
    });

    return memberships.map((membership: TeamMember) => membership.teamId);
}

/**
 * POST /api/mentions
 * Process mentions in text and create notifications for users in shared teams.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedBody = mentionPostSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            throw ApiErrors.badRequest("Invalid mention payload", parsedBody.error.flatten());
        }

        const { text, contextType, contextId, contextName } = parsedBody.data;
        const handles = extractMentionHandles(text);

        if (handles.length === 0) {
            return NextResponse.json({ mentions: [], notificationsSent: 0 });
        }

        const sharedTeamIds = await getSharedTeamIds(session.user.id);
        if (sharedTeamIds.length === 0) {
            return NextResponse.json({ mentions: [], notificationsSent: 0 });
        }

        const searchClauses = handles.flatMap((handle: string) => [
            { name: { contains: handle, mode: "insensitive" as const } },
            { email: { startsWith: `${handle}@`, mode: "insensitive" as const } },
        ]);

        const users = await db.user.findMany({
            where: {
                id: { not: session.user.id },
                teamMembers: {
                    some: {
                        teamId: { in: sharedTeamIds },
                    },
                },
                OR: searchClauses,
            },
            select: { id: true, name: true, email: true },
            take: MAX_MENTION_TARGETS,
        });

        if (users.length === 0) {
            return NextResponse.json({ mentions: [], notificationsSent: 0 });
        }

        const notificationResults = await Promise.allSettled(
            users.map((user: User) =>
                sendNotification({
                    userId: user.id,
                    type: "MENTION",
                    title: "You were mentioned",
                    message: `**${session.user.name || "Someone"}** mentioned you in ${contextName || contextType}`,
                    link: buildMentionLink(contextType, contextId),
                }),
            ),
        );

        const notificationsSent = notificationResults.filter((result: PromiseSettledResult<any>) => result.status === "fulfilled").length;

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "MENTION_USERS",
                entity: "Notification",
                entityId: session.user.id,
                details: {
                    handles,
                    contextType,
                    contextId,
                    notificationsSent,
                },
            });
        } catch {
            // Keep mention processing non-blocking if audit logging fails.
        }

        return NextResponse.json({
            mentions: users.map((user: User) => ({
                id: user.id,
                name: user.name,
                email: user.email,
            })),
            notificationsSent,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * GET /api/mentions
 * Search users for mention autocomplete, scoped to shared teams.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = mentionSearchSchema.safeParse({
            q: new URL(req.url).searchParams.get("q") ?? "",
            limit: new URL(req.url).searchParams.get("limit") ?? 10,
        });

        if (!parsedQuery.success) {
            throw ApiErrors.badRequest("Invalid mention search query", parsedQuery.error.flatten());
        }

        const { q: query, limit } = parsedQuery.data;
        const teamIds = await getSharedTeamIds(session.user.id);

        const users = await db.user.findMany({
            where: {
                OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                ],
                ...(teamIds.length > 0
                    ? {
                        teamMembers: {
                            some: {
                                teamId: { in: teamIds },
                            },
                        },
                    }
                    : {
                        id: session.user.id,
                    }),
            },
            select: { id: true, name: true, image: true },
            take: limit,
            orderBy: [{ name: "asc" }],
        });

        return NextResponse.json({ users });
    } catch (error) {
        return errorResponse(error);
    }
}
