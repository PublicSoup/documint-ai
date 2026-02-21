import { db } from "./db";
import { Prisma } from "@prisma/client";
import { subDays } from "date-fns";

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

function toDateKey(date: Date): string {
    return date.toISOString().split("T")[0];
}

export async function getAnalyticsData(userId: string, teamId?: string, days = 30): Promise<AnalyticsData> {
    const whereClause: Prisma.FileWhereInput = teamId
        ? { teamId }
        : { userId, teamId: null };

    const startDate = subDays(new Date(), days);

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

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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

    const staleThreshold = subDays(now, 30);

    const staleDocs = files
        .filter((file) => file.documentation)
        .map((file) => {
            if (!file.documentation) return null;

            const fileUpdatedAt = new Date(file.updatedAt);
            const docUpdatedAt = new Date(file.documentation.updatedAt);

            const isOutOfSync = fileUpdatedAt.getTime() > docUpdatedAt.getTime() + 5 * 60 * 1000;
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

    const activityWindow = Math.min(days, 30);
    const activityMap = new Map<string, { views: number; creations: number }>();
    for (let i = 0; i < activityWindow; i++) {
        const date = subDays(new Date(), i);
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
    for (let i = 0; i < days; i++) {
        const date = subDays(new Date(), i);
        heatmapMap.set(toDateKey(date), 0);
    }

    for (const version of versionStats) {
        const key = toDateKey(version.createdAt);
        heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
    }

    const heatmap = Array.from(heatmapMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const sevenDaysAgo = subDays(now, 7);
    const fourteenDaysAgo = subDays(now, 14);

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

    const documented = files.filter((file) => Boolean(file.documentation)).length;

    return {
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
        coverage: {
            documented,
            total: files.length,
            percentage: files.length > 0 ? Math.round((documented / files.length) * 100) : 0,
        },
    };
}
