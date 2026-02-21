import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

interface AnalyticsResponse {
    overview: {
        totalFiles: number;
        totalViews: number;
        avgViewDuration: number;
        docsCreatedThisMonth: number;
        velocity: {
            score: number;
            trend: "up" | "down" | "stable";
        };
    };
    topDocs: {
        id: string;
        name: string;
        language: string;
        views: number;
        avgDuration: number;
    }[];
    staleDocs: {
        id: string;
        name: string;
        daysSinceUpdate: number;
        reason: "OUT_OF_SYNC" | "OLD_VERSION";
    }[];
    recentActivity: {
        date: string;
        views: number;
        creations: number;
    }[];
    heatmap: {
        date: string;
        count: number;
    }[];
    teamInfo?: {
        name: string;
        memberCount: number;
        coverageGoal: number;
    };
    coverage: {
        documented: number;
        total: number;
        percentage: number;
    };
}

const analyticsQuerySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
    days: z.coerce.number().int().min(7).max(365).default(30),
}).strict();

const trackViewSchema = z.object({
    fileId: z.string().trim().min(1).max(100),
    duration: z.coerce.number().int().min(0).max(60 * 60 * 12).default(0),
}).strict();

type TeamConfig = {
    coverageGoal?: number;
};

function toDateKey(date: Date): string {
    return date.toISOString().split("T")[0];
}

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

        const whereClause: Prisma.FileWhereInput = teamId
            ? { teamId }
            : { userId: session.user.id, teamId: null };

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        let teamInfo: AnalyticsResponse["teamInfo"];
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
                const config = (rawConfig && typeof rawConfig === "object" ? rawConfig : {}) as TeamConfig;

                teamInfo = {
                    name: team.name,
                    memberCount: team._count.members,
                    coverageGoal: config.coverageGoal ?? 80,
                };
            }
        }

        const files = await db.file.findMany({
            where: whereClause,
            include: {
                documentation: {
                    select: {
                        updatedAt: true,
                        content: true,
                    },
                },
                views: {
                    where: { createdAt: { gte: startDate } },
                    select: { createdAt: true, duration: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        const totalViews = files.reduce((sum, file) => sum + file.views.length, 0);
        const totalDuration = files.reduce(
            (sum, file) => sum + file.views.reduce((viewTotal, view) => viewTotal + view.duration, 0),
            0,
        );
        const avgViewDuration = totalViews > 0 ? Math.round(totalDuration / totalViews) : 0;

        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const docsCreatedThisMonth = files.filter((file) => file.createdAt >= thisMonth).length;

        const topDocs = files
            .filter((file) => file.views.length > 0)
            .sort((a, b) => b.views.length - a.views.length)
            .slice(0, 5)
            .map((file) => {
                const docDuration = file.views.reduce((sum, view) => sum + view.duration, 0);
                return {
                    id: file.id,
                    name: file.name,
                    language: file.language,
                    views: file.views.length,
                    avgDuration: file.views.length > 0 ? Math.round(docDuration / file.views.length) : 0,
                };
            });

        const now = new Date();
        const staleThreshold = new Date();
        staleThreshold.setDate(staleThreshold.getDate() - 30);

        const staleDocs = files
            .filter((file) => file.documentation)
            .map((file) => {
                if (!file.documentation) {
                    return null;
                }

                const fileUpdatedAt = new Date(file.updatedAt);
                const docUpdatedAt = new Date(file.documentation.updatedAt);

                const isOutOfSync = fileUpdatedAt.getTime() > docUpdatedAt.getTime() + 5 * 60 * 1000;
                const isOldVersion = docUpdatedAt < staleThreshold;

                if (!isOutOfSync && !isOldVersion) {
                    return null;
                }

                return {
                    id: file.id,
                    name: file.name,
                    daysSinceUpdate: Math.floor((now.getTime() - docUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)),
                    reason: isOutOfSync ? "OUT_OF_SYNC" as const : "OLD_VERSION" as const,
                };
            })
            .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
            .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
            .slice(0, 10);

        const activityWindow = Math.min(days, 30);
        const activityMap = new Map<string, { views: number; creations: number }>();
        for (let index = 0; index < activityWindow; index += 1) {
            const date = new Date();
            date.setDate(date.getDate() - index);
            activityMap.set(toDateKey(date), { views: 0, creations: 0 });
        }

        for (const file of files) {
            const createdAtKey = toDateKey(file.createdAt);
            const existingCreatedEntry = activityMap.get(createdAtKey);
            if (existingCreatedEntry) {
                existingCreatedEntry.creations += 1;
            }

            for (const view of file.views) {
                const viewDateKey = toDateKey(view.createdAt);
                const existingViewEntry = activityMap.get(viewDateKey);
                if (existingViewEntry) {
                    existingViewEntry.views += 1;
                }
            }
        }

        const recentActivity = Array.from(activityMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .reverse();

        const versionStats = await db.docVersion.findMany({
            where: {
                documentation: {
                    file: whereClause,
                },
                createdAt: { gte: startDate },
            },
            select: { createdAt: true },
        });

        const heatmapMap = new Map<string, number>();
        for (let index = 0; index < days; index += 1) {
            const date = new Date();
            date.setDate(date.getDate() - index);
            heatmapMap.set(toDateKey(date), 0);
        }

        for (const version of versionStats) {
            const key = toDateKey(version.createdAt);
            heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
        }

        const heatmap = Array.from(heatmapMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const creationsThisWeek = files.filter((file) => file.createdAt >= sevenDaysAgo).length;
        const creationsLastWeek = files.filter((file) => file.createdAt >= fourteenDaysAgo && file.createdAt < sevenDaysAgo).length;

        const velocityScore = creationsLastWeek === 0
            ? (creationsThisWeek > 0 ? 100 : 0)
            : Math.round(((creationsThisWeek - creationsLastWeek) / creationsLastWeek) * 100);

        const velocityTrend: "up" | "down" | "stable" = velocityScore > 5
            ? "up"
            : velocityScore < -5
                ? "down"
                : "stable";

        const documented = files.filter((file) => Boolean(file.documentation?.content)).length;

        const response: AnalyticsResponse = {
            overview: {
                totalFiles: files.length,
                totalViews,
                avgViewDuration,
                docsCreatedThisMonth,
                velocity: {
                    score: velocityScore,
                    trend: velocityTrend,
                },
            },
            topDocs,
            staleDocs,
            recentActivity,
            heatmap,
            teamInfo,
            coverage: {
                documented,
                total: files.length,
                percentage: files.length > 0 ? Math.round((documented / files.length) * 100) : 0,
            },
        };

        return NextResponse.json(response);
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
