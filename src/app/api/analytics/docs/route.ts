import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";

interface AnalyticsResponse {
    overview: {
        totalFiles: number;
        totalViews: number;
        avgViewDuration: number;
        docsCreatedThisMonth: number;
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
    }[];
    recentActivity: {
        date: string;
        views: number;
        creations: number;
    }[];
    coverage: {
        documented: number;
        total: number;
        percentage: number;
    };
}

export async function GET(request: NextRequest) {
    try {
        // Check feature access
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const teamId = searchParams.get("teamId");
        const days = parseInt(searchParams.get("days") || "30");

        // Build where clause for files
        const whereClause: any = teamId
            ? { teamId }
            : { userId: session.user.id, teamId: null };

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get all files with view counts
        const files = await db.file.findMany({
            where: whereClause,
            include: {
                documentation: true,
                views: {
                    where: { createdAt: { gte: startDate } }
                },
                _count: {
                    select: { views: true }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        // Calculate overview stats
        const totalViews = files.reduce((sum, f) => sum + f._count.views, 0);
        const totalDuration = files.reduce((sum, f) =>
            sum + f.views.reduce((vSum, v) => vSum + v.duration, 0), 0
        );
        const avgViewDuration = totalViews > 0 ? Math.round(totalDuration / totalViews) : 0;

        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const docsCreatedThisMonth = files.filter(f =>
            new Date(f.createdAt) >= thisMonth
        ).length;

        // Top documents by views
        const topDocs = files
            .filter(f => f._count.views > 0)
            .sort((a, b) => b._count.views - a._count.views)
            .slice(0, 5)
            .map(f => {
                const totalDur = f.views.reduce((s, v) => s + v.duration, 0);
                return {
                    id: f.id,
                    name: f.name,
                    language: f.language,
                    views: f._count.views,
                    avgDuration: f.views.length > 0 ? Math.round(totalDur / f.views.length) : 0
                };
            });

        // Stale documents (not updated in 30+ days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const staleDocs = files
            .filter(f => new Date(f.updatedAt) < thirtyDaysAgo)
            .map(f => ({
                id: f.id,
                name: f.name,
                daysSinceUpdate: Math.floor(
                    (Date.now() - new Date(f.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
                )
            }))
            .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
            .slice(0, 5);

        // Recent activity (views & creations per day)
        const activityMap = new Map<string, { views: number; creations: number }>();

        for (let i = 0; i < Math.min(days, 14); i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split("T")[0];
            activityMap.set(dateStr, { views: 0, creations: 0 });
        }

        files.forEach(f => {
            const dateStr = new Date(f.createdAt).toISOString().split("T")[0];
            if (activityMap.has(dateStr)) {
                activityMap.get(dateStr)!.creations++;
            }
            f.views.forEach(v => {
                const vDateStr = new Date(v.createdAt).toISOString().split("T")[0];
                if (activityMap.has(vDateStr)) {
                    activityMap.get(vDateStr)!.views++;
                }
            });
        });

        const recentActivity = Array.from(activityMap.entries())
            .map(([date, data]) => ({ date, ...data }))
            .reverse();

        // Documentation coverage
        const documented = files.filter(f => f.documentation?.content).length;
        const coverage = {
            documented,
            total: files.length,
            percentage: files.length > 0 ? Math.round((documented / files.length) * 100) : 0
        };

        const response: AnalyticsResponse = {
            overview: {
                totalFiles: files.length,
                totalViews,
                avgViewDuration,
                docsCreatedThisMonth
            },
            topDocs,
            staleDocs,
            recentActivity,
            coverage
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("Analytics error:", error);
        return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
    }
}

// Track a view
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        const { fileId, duration } = await request.json();

        if (!fileId) {
            return NextResponse.json({ error: "File ID required" }, { status: 400 });
        }

        // Create view record
        await db.docView.create({
            data: {
                fileId,
                userId: session?.user?.id || null,
                sessionId: request.headers.get("x-session-id") || null,
                duration: duration || 0
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Track view error:", error);
        return NextResponse.json({ error: "Failed to track view" }, { status: 500 });
    }
}
