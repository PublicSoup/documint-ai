import { db } from "./db";
import { Prisma } from "@prisma/client";
import { subDays } from "date-fns";
import { getCached, CACHE_CONFIG, invalidateUserAnalyticsCache } from "./cache";

export interface AnalyticsData {
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
        language: string | null;
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
    coverage: {
        documented: number;
        total: number;
        percentage: number;
    };
}

export interface MarketingCtaAnalytics {
    totalEvents: number;
    ctas: {
        eventName: string;
        location: string;
        count: number;
    }[];
}

function toDateKey(date: Date): string {
    return date.toISOString().split("T")[0];
}

function isMarketingDetails(details: Prisma.JsonValue | null): details is Prisma.JsonObject {
    if (!details || typeof details !== "object" || Array.isArray(details)) return false;

    const eventName = details["eventName"];
    const location = details["location"];

    return typeof eventName === "string" && typeof location === "string";
}

export async function getMarketingCtaAnalytics(_userId: string, days = 30): Promise<MarketingCtaAnalytics> {
    const startDate = subDays(new Date(), days);

    const logs = await db.auditLog.findMany({
        where: {
            action: "MARKETING_EVENT",
            createdAt: { gte: startDate },
        },
        select: {
            details: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
    });

    const counts = new Map<string, { eventName: string; location: string; count: number }>();

    for (const log of logs) {
        if (!isMarketingDetails(log.details)) continue;

        const eventNameValue = log.details["eventName"];
        const locationValue = log.details["location"];

        if (typeof eventNameValue !== "string" || typeof locationValue !== "string") continue;

        const key = `${eventNameValue}|${locationValue}`;
        const existing = counts.get(key);

        if (existing) {
            existing.count += 1;
            continue;
        }

        counts.set(key, {
            eventName: eventNameValue,
            location: locationValue,
            count: 1,
        });
    }

    const ctas = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    const totalEvents = ctas.reduce((sum, cta) => sum + cta.count, 0);

    return { totalEvents, ctas };
}

/**
 * Generate analytics data (core function with Redis caching)
 * This function is optimized to perform aggregations and calculations on the database side
 * to minimize memory usage and improve performance on large datasets.
 */
async function computeAnalyticsData(userId: string, teamId?: string, days = 30): Promise<AnalyticsData> {
    let whereClause: Prisma.FileWhereInput = { userId, teamId: null };
    let docViewWhereClause: Prisma.DocViewWhereInput = { file: { userId, teamId: null } };

    if (teamId) {
        const membership = await db.teamMember.findUnique({
            where: { teamId_userId: { teamId, userId } },
            select: { teamId: true },
        });

        if (!membership) {
            throw new Error("Forbidden");
        }

        whereClause = { teamId };
        docViewWhereClause = { file: { teamId } };
    }

    const now = new Date();
    const startDate = subDays(now, days);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = subDays(now, 7);
    const fourteenDaysAgo = subDays(now, 14);


    // --- Run aggregation queries in parallel ---
    const [
        totalFiles,
        docsCreatedThisMonth,
        viewStats,
        creationsThisWeek,
        creationsLastWeek,
        documented,
    ] = await Promise.all([
        // Total files
        db.file.count({ where: whereClause }),
        // Docs created this month
        db.file.count({ where: { ...whereClause, createdAt: { gte: thisMonth } } }),
        // Aggregate views and duration
        db.docView.aggregate({
            where: { ...docViewWhereClause, createdAt: { gte: startDate } },
            _count: { _all: true },
            _sum: { duration: true },
        }),
        // Creations for velocity score (this week)
        db.file.count({ where: { ...whereClause, createdAt: { gte: sevenDaysAgo } } }),
        // Creations for velocity score (last week)
        db.file.count({ where: { ...whereClause, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } } }),
        // Count of documented files
        db.file.count({ where: { ...whereClause, documentation: { isNot: null } } }),
    ]);

    const totalViews = viewStats._count._all;
    const totalDuration = viewStats._sum.duration ?? 0;
    const avgViewDuration = totalViews > 0 ? Math.round(totalDuration / totalViews) : 0;

    const velocityScore = creationsLastWeek === 0
        ? (creationsThisWeek > 0 ? 100 : 0)
        : Math.round(((creationsThisWeek - creationsLastWeek) / creationsLastWeek) * 100);

    const velocityTrend: "up" | "down" | "stable" = velocityScore > 5 ? "up" : velocityScore < -5 ? "down" : "stable";

    // --- More complex queries that run after initial stats ---

    // Top Docs
    const topDocsData = await db.docView.groupBy({
        by: ['fileId'],
        where: { ...docViewWhereClause, createdAt: { gte: startDate } },
        _count: { _all: true },
        _sum: { duration: true },
        orderBy: { _count: { fileId: 'desc' } },
        take: 5,
    });

    const topDocsFileIds = topDocsData.map(d => d.fileId);
    const topDocsFiles = await db.file.findMany({
        where: { id: { in: topDocsFileIds } },
        select: { id: true, name: true, language: true },
    });
    const topDocsFileMap = new Map(topDocsFiles.map(f => [f.id, f]));

    const topDocs = topDocsData.map(data => {
        const file = topDocsFileMap.get(data.fileId);
        return {
            id: data.fileId,
            name: file?.name ?? 'Unknown File',
            language: file?.language ?? null,
            views: data._count._all,
            avgDuration: data._sum.duration ? Math.round(data._sum.duration / data._count._all) : 0,
        };
    });

    // Stale Docs (requires file and doc data, harder to aggregate)
    const filesForStaleCheck = await db.file.findMany({
        where: { ...whereClause, documentation: { isNot: null } },
        select: {
            id: true,
            name: true,
            updatedAt: true,
            documentation: { select: { updatedAt: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 1000,
    });

    const staleThreshold = subDays(now, 30);
    const staleDocs = filesForStaleCheck
        .map((file) => {
            if (!file.documentation) return null;
            const docUpdatedAt = new Date(file.documentation.updatedAt);
            const isOutOfSync = new Date(file.updatedAt).getTime() > docUpdatedAt.getTime() + 5 * 60 * 1000;
            const isOldVersion = docUpdatedAt < staleThreshold;

            if (!isOutOfSync && !isOldVersion) return null;

            return {
                id: file.id,
                name: file.name,
                daysSinceUpdate: Math.floor((now.getTime() - docUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)),
                reason: (isOutOfSync ? "OUT_OF_SYNC" : "OLD_VERSION") as "OUT_OF_SYNC" | "OLD_VERSION",
            };
        })
        .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
        .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
        .slice(0, 10);

    // Recent activity & Heatmap (still requires some in-memory mapping)
    // This is a tradeoff, as date-series data is complex in SQL. This is still better
    // than fetching all file data.
    const [viewActivity, creationActivity, versionActivity] = await Promise.all([
        db.docView.groupBy({
            by: ['createdAt'],
            where: { ...docViewWhereClause, createdAt: { gte: subDays(now, Math.min(days, 30)) } },
            _count: { _all: true },
        }),
        db.file.groupBy({
            by: ['createdAt'],
            where: { ...whereClause, createdAt: { gte: subDays(now, Math.min(days, 30)) } },
            _count: { _all: true },
        }),
        db.docVersion.groupBy({
            by: ['createdAt'],
            where: { documentation: { file: whereClause }, createdAt: { gte: startDate } },
            _count: { _all: true },
        })
    ]);

    const activityMap = new Map<string, { views: number; creations: number }>();
    for (let i = 0; i < Math.min(days, 30); i++) {
        activityMap.set(toDateKey(subDays(now, i)), { views: 0, creations: 0 });
    }
    viewActivity.forEach(v => {
        const key = toDateKey(v.createdAt);
        const activity = activityMap.get(key);
        if (activity) activity.views = v._count._all;
    });
    creationActivity.forEach(c => {
        const key = toDateKey(c.createdAt);
        const activity = activityMap.get(key);
        if (activity) activity.creations = c._count._all;
    });

    const recentActivity = Array.from(activityMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .reverse();

    const heatmapMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
        heatmapMap.set(toDateKey(subDays(now, i)), 0);
    }
    versionActivity.forEach(v => {
        heatmapMap.set(toDateKey(v.createdAt), v._count._all);
    });

    const heatmap = Array.from(heatmapMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));


    return {
        overview: {
            totalFiles: totalFiles,
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
        coverage: {
            documented,
            total: totalFiles,
            percentage: totalFiles > 0 ? Math.round((documented / totalFiles) * 100) : 0,
        },
    };
}

export async function getAnalyticsData(userId: string, teamId?: string, days = 30): Promise<AnalyticsData> {
    // Generate cache key unique to user/team/days combination
    const cacheKey = teamId
        ? `${CACHE_CONFIG.ANALYTICS_DATA.prefix}:${userId}:${teamId}:${days}`
        : `${CACHE_CONFIG.ANALYTICS_DATA.prefix}:${userId}:${days}`;

    const result = await getCached(
        cacheKey,
        () => computeAnalyticsData(userId, teamId, days),
        CACHE_CONFIG.ANALYTICS_DATA.ttl
    );

    return result.data;
}

/**
 * Manually invalidate analytics cache for a user (call after significant data changes)
 */
export function clearAnalyticsCache(userId: string, teamId?: string): Promise<void> {
    return invalidateUserAnalyticsCache(userId, teamId);
}