import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const querySchema = z.object({
    period: z.enum(["7d", "30d", "90d"]).default("7d"),
});

type AuditLogUsage = {
    action: string;
    createdAt: Date;
};

/**
 * GET /api/analytics/usage
 * Returns daily API usage stats for the current user.
 */
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // Check feature access
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        // Rate limiting
        await enforceRateLimit(session.user.id, "api");

        const { searchParams } = new URL(req.url);
        const { period } = validateQuery(searchParams, querySchema);

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        const days = period === "30d" ? 30 : period === "90d" ? 90 : 7;
        startDate.setDate(startDate.getDate() - days);

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

        logs.forEach((log: AuditLogUsage) => {
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
        return errorResponse(error);
    }
}
