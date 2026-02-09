import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasFeatureAccess } from "@/lib/subscription";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check feature access
        const hasAccess = await hasFeatureAccess(session.user.id, "analytics");
        if (!hasAccess) {
            return NextResponse.json({ error: "Pro required" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const period = searchParams.get("period") || "7d"; // 7d, 30d, 90d

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        switch (period) {
            case "30d":
                startDate.setDate(startDate.getDate() - 30);
                break;
            case "90d":
                startDate.setDate(startDate.getDate() - 90);
                break;
            default:
                startDate.setDate(startDate.getDate() - 7);
        }

        // Get audit logs grouped by day for API usage
        const logs = await db.auditLog.findMany({
            where: {
                userId: session.user.id,
                createdAt: { gte: startDate, lte: endDate }
            },
            select: {
                action: true,
                createdAt: true
            }
        });

        // Group by day
        const dailyUsage: Record<string, number> = {};
        const actionCounts: Record<string, number> = {};

        logs.forEach(log => {
            const day = log.createdAt.toISOString().split('T')[0];
            dailyUsage[day] = (dailyUsage[day] || 0) + 1;
            actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        });

        // Fill in missing days
        const chartData = [];
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const day = currentDate.toISOString().split('T')[0];
            chartData.push({
                date: day,
                calls: dailyUsage[day] || 0
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Get doc views for engagement
        const views = await db.docView.count({
            where: {
                file: { userId: session.user.id },
                createdAt: { gte: startDate, lte: endDate }
            }
        });

        // Get file creation over time
        const filesCreated = await db.file.count({
            where: {
                userId: session.user.id,
                createdAt: { gte: startDate, lte: endDate }
            }
        });

        return NextResponse.json({
            period,
            summary: {
                totalCalls: logs.length,
                totalViews: views,
                filesCreated,
                avgDailyCalls: Math.round(logs.length / chartData.length) || 0
            },
            chartData,
            actionBreakdown: Object.entries(actionCounts).map(([action, count]) => ({
                action,
                count
            })).sort((a, b) => b.count - a.count)
        });

    } catch (error) {
        console.error("API Usage Error:", error);
        return NextResponse.json({ error: "Failed to fetch usage data" }, { status: 500 });
    }
}
