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

type TeamConfig = {
    coverageGoal?: number;
};

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

        const team = await db.team.findUnique({
            where: { id: teamId },
            include: {
                integrations: {
                    where: { type: "TEAM_CONFIG" },
                    take: 1,
                    select: { config: true },
                },
            },
        });

        if (!team) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
        }

        const files = await db.file.findMany({
            where: { teamId },
            include: {
                documentation: {
                    select: { updatedAt: true },
                },
            },
        });

        const totalFiles = files.length;
        if (totalFiles === 0) {
            return NextResponse.json({
                teamName: team.name,
                totalScore: 0,
                grade: "N/A",
                metrics: {
                    coverage: { value: 0, target: 80, status: "warning" },
                    drift: { value: 0, count: 0, status: "healthy" },
                    velocity: { value: 0, status: "stale" },
                },
                generatedAt: new Date().toISOString(),
            });
        }

        const documentedCount = files.filter((file) => file.documentation !== null).length;
        const coverage = Math.round((documentedCount / totalFiles) * 100);

        const driftCount = files.filter((file) => {
            if (!file.documentation) {
                return false;
            }
            return file.updatedAt.getTime() > file.documentation.updatedAt.getTime() + 5 * 60 * 1000;
        }).length;

        const driftRate = documentedCount > 0 ? Math.round((driftCount / documentedCount) * 100) : 0;

        const sevenDaysAgo = subDays(new Date(), 7);
        const velocity = files.filter((file) => file.createdAt >= sevenDaysAgo).length;

        const coverageWeight = coverage * 0.5;
        const driftWeight = (100 - driftRate) * 0.3;
        const velocityWeight = Math.min((velocity / Math.max(totalFiles * 0.1, 1)) * 100, 100) * 0.2;
        const totalScore = Math.round(coverageWeight + driftWeight + velocityWeight);

        const grade = totalScore >= 90
            ? "A"
            : totalScore >= 80
                ? "B"
                : totalScore >= 70
                    ? "C"
                    : totalScore >= 60
                        ? "D"
                        : "F";

        const teamConfigRaw = team.integrations[0]?.config;
        const teamConfig = (teamConfigRaw && typeof teamConfigRaw === "object" ? teamConfigRaw : {}) as TeamConfig;
        const targetGoal = teamConfig.coverageGoal ?? 80;

        return NextResponse.json({
            teamName: team.name,
            totalScore,
            grade,
            metrics: {
                coverage: {
                    value: coverage,
                    target: targetGoal,
                    status: coverage >= targetGoal ? "healthy" : "warning",
                },
                drift: {
                    value: driftRate,
                    count: driftCount,
                    status: driftRate < 10 ? "healthy" : driftRate < 25 ? "warning" : "critical",
                },
                velocity: {
                    value: velocity,
                    status: velocity > 0 ? "active" : "stale",
                },
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("[Scorecard_API] Error:", error);
        return NextResponse.json({ error: "Failed to generate scorecard" }, { status: 500 });
    }
}
