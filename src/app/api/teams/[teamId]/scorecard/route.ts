import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-gate";
import { subDays } from "date-fns";

/**
 * GET /api/teams/[teamId]/scorecard
 * Aggregates high-level project metrics into a weighted health score.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const { teamId } = await params;
        
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 1. Fetch team info and config
        const team = await db.team.findUnique({
            where: { id: teamId },
            include: {
                integrations: {
                    where: { type: "TEAM_CONFIG" },
                    take: 1
                }
            }
        });

        if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

        // 2. Fetch all files and docs
        const files = await db.file.findMany({
            where: { teamId },
            include: {
                documentation: {
                    select: { status: true, updatedAt: true }
                }
            }
        });

        const totalFiles = files.length;
        if (totalFiles === 0) {
            return NextResponse.json({ 
                grade: "N/A", 
                score: 0, 
                message: "No files found in project." 
            });
        }

        // 3. Aggregate Metrics
        const documentedCount = files.filter(f => f.documentation).length;
        const coverage = Math.round((documentedCount / totalFiles) * 100);
        
        const driftCount = files.filter(f => {
            if (!f.documentation) return false;
            return new Date(f.updatedAt).getTime() > new Date(f.documentation.updatedAt).getTime() + 300000;
        }).length;
        const driftRate = documentedCount > 0 ? Math.round((driftCount / documentedCount) * 100) : 0;

        // 4. Calculate Velocity (Last 7 days creations)
        const sevenDaysAgo = subDays(new Date(), 7);
        const velocity = files.filter(f => new Date(f.createdAt) >= sevenDaysAgo).length;

        // 5. Calculate Weighted Score (0-100)
        // 50% Coverage, 30% Drift (Inverse), 20% Activity/Velocity
        const coverageWeight = coverage * 0.5;
        const driftWeight = (100 - driftRate) * 0.3;
        const velocityWeight = Math.min((velocity / (totalFiles * 0.1 || 1)) * 100, 100) * 0.2;
        
        const totalScore = Math.round(coverageWeight + driftWeight + velocityWeight);

        // 6. Assign Grade
        let grade = "F";
        if (totalScore >= 90) grade = "A";
        else if (totalScore >= 80) grade = "B";
        else if (totalScore >= 70) grade = "C";
        else if (totalScore >= 60) grade = "D";

        const targetGoal = ((team.integrations[0]?.config as { coverageGoal?: number } | null)?.coverageGoal) || 80;

        return NextResponse.json({
            teamName: team.name,
            totalScore,
            grade,
            metrics: {
                coverage: { value: coverage, target: targetGoal, status: coverage >= targetGoal ? "healthy" : "warning" },
                drift: { value: driftRate, count: driftCount, status: driftRate < 10 ? "healthy" : driftRate < 25 ? "warning" : "critical" },
                velocity: { value: velocity, status: velocity > 0 ? "active" : "stale" }
            },
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error("[Scorecard_API] Error:", error);
        return NextResponse.json({ error: "Failed to generate scorecard" }, { status: 500 });
    }
}
