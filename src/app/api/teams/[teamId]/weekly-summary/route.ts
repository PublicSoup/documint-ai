import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { subDays } from "date-fns";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

interface ContributorStat {
    name: string;
    image: string | null;
    count: number;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const now = new Date();
        const thisWeekStart = subDays(now, 7);
        const lastWeekStart = subDays(now, 14);

        const teamFiles = await db.file.findMany({
            where: { teamId },
            select: { id: true },
        });

        const fileIds = teamFiles.map((file) => file.id);

        const entityFilters: { entityId: string | { in: string[] } }[] = [{ entityId: teamId }];
        if (fileIds.length > 0) {
            entityFilters.push({ entityId: { in: fileIds } });
        }

        const logs = await db.auditLog.findMany({
            where: {
                OR: entityFilters,
                action: { in: ["APPROVE", "UPDATE", "ANALYZE", "CREATE_FILE", "VERIFY"] },
                createdAt: { gte: lastWeekStart },
            },
            include: {
                user: {
                    select: { name: true, email: true, image: true },
                },
            },
        });

        const stats = {
            thisWeek: { creations: 0, approvals: 0, updates: 0 },
            lastWeek: { creations: 0, approvals: 0, updates: 0 },
            contributors: new Map<string, ContributorStat>(),
        };

        for (const log of logs) {
            const isThisWeek = log.createdAt >= thisWeekStart;
            const target = isThisWeek ? stats.thisWeek : stats.lastWeek;

            if (log.action === "APPROVE" || log.action === "VERIFY") {
                target.approvals += 1;
            } else if (log.action === "UPDATE") {
                target.updates += 1;
            } else if (log.action === "ANALYZE" || log.action === "CREATE_FILE") {
                target.creations += 1;
            }

            if (isThisWeek && log.user && log.userId) {
                const current = stats.contributors.get(log.userId) ?? {
                    name: log.user.name || log.user.email?.split("@")[0] || "Unknown",
                    image: log.user.image,
                    count: 0,
                };
                current.count += 1;
                stats.contributors.set(log.userId, current);
            }
        }

        const topContributors = Array.from(stats.contributors.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        const creationsChange = stats.lastWeek.creations === 0
            ? (stats.thisWeek.creations > 0 ? 100 : 0)
            : Math.round(((stats.thisWeek.creations - stats.lastWeek.creations) / stats.lastWeek.creations) * 100);

        const approvalsChange = stats.lastWeek.approvals === 0
            ? (stats.thisWeek.approvals > 0 ? 100 : 0)
            : Math.round(((stats.thisWeek.approvals - stats.lastWeek.approvals) / stats.lastWeek.approvals) * 100);

        return NextResponse.json({
            trends: {
                creations: {
                    current: stats.thisWeek.creations,
                    previous: stats.lastWeek.creations,
                    change: creationsChange,
                },
                approvals: {
                    current: stats.thisWeek.approvals,
                    previous: stats.lastWeek.approvals,
                    change: approvalsChange,
                },
            },
            topContributors,
            totalActivity: stats.thisWeek.creations + stats.thisWeek.approvals + stats.thisWeek.updates,
        });
    } catch (error) {
        console.error("[WeeklySummary_API] Error:", error);
        return NextResponse.json({ error: "Aggregation failed" }, { status: 500 });
    }
}
