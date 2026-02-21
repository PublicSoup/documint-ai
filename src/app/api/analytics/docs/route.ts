import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { getAnalyticsData } from "@/lib/analytics";

const analyticsQuerySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
    days: z.coerce.number().int().min(7).max(365).default(30),
}).strict();

const trackViewSchema = z.object({
    fileId: z.string().trim().min(1).max(100),
    duration: z.coerce.number().int().min(0).max(60 * 60 * 12).default(0),
}).strict();

export async function GET(request: NextRequest) {
    try {
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedQuery = analyticsQuerySchema.safeParse({
            teamId: request.nextUrl.searchParams.get("teamId") ?? undefined,
            days: request.nextUrl.searchParams.get("days") ?? undefined,
        });

        if (!parsedQuery.success) {
            return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
        }

        const { teamId, days } = parsedQuery.data;

        if (teamId) {
            const canView = await checkTeamPermission(session.user.id, teamId, "view");
            if (!canView) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const data = await getAnalyticsData(session.user.id, teamId, days);

        let teamInfo;
        if (teamId) {
            const team = await db.team.findUnique({
                where: { id: teamId },
                include: {
                    _count: { select: { members: true } },
                    integrations: {
                        where: { type: "TEAM_CONFIG" },
                        take: 1,
                        select: { config: true },
                    },
                },
            });

            if (team) {
                const rawConfig = team.integrations[0]?.config;
                const config = (rawConfig && typeof rawConfig === "object" ? rawConfig : {}) as { coverageGoal?: number };

                teamInfo = {
                    name: team.name,
                    memberCount: team._count.members,
                    coverageGoal: config.coverageGoal ?? 80,
                };
            }
        }

        return NextResponse.json({ ...data, teamInfo });
    } catch (error) {
        console.error("Analytics error:", error);
        return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedBody = trackViewSchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileId, duration } = parsedBody.data;

        const file = await db.file.findUnique({
            where: { id: fileId },
            select: { id: true, userId: true, teamId: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (file.teamId) {
            const canView = await checkTeamPermission(session.user.id, file.teamId, "view");
            if (!canView) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        } else if (file.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const ip = await getClientIP(request);

        await db.docView.create({
            data: {
                fileId,
                userId: session.user.id,
                sessionId: request.headers.get("x-session-id") || ip,
                duration,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Track view error:", error);
        return NextResponse.json({ error: "Failed to track view" }, { status: 500 });
    }
}
