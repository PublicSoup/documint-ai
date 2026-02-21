import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-gate";

/**
 * GET /api/teams/[teamId]/health-data
 * Fetch detailed documentation health data for reporting.
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

        // 1. Fetch team info
        const team = await db.team.findUnique({
            where: { id: teamId },
            include: {
                _count: { select: { members: true } },
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
                    select: { status: true, updatedAt: true, verifiedAt: true }
                }
            }
        });

        // 3. Aggregate stats
        const totalFiles = files.length;
        const documentedFiles = files.filter(f => f.documentation).length;
        const coverage = totalFiles > 0 ? Math.round((documentedFiles / totalFiles) * 100) : 0;
        
        const staleFiles = files.filter(f => {
            if (!f.documentation) return false;
            return new Date(f.updatedAt).getTime() > new Date(f.documentation.updatedAt).getTime() + 300000;
        });

        // 3.1 Identify critical undocumented components (hotspots)
        const criticalUndocumented = files
            .filter(f => !f.documentation)
            .map(f => ({
                ...f,
                riskScore: Math.min(100, Math.round((f.size / 2000) * 70) + (f.name.includes("api") ? 20 : 0) + (f.language === "typescript" || f.language === "javascript" ? 10 : 0))
            }))
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 5)
            .map(f => ({
                name: f.name,
                size: f.size,
                lang: f.language,
                riskScore: f.riskScore
            }));

        const verifiedCount = files.filter(f => f.documentation?.verifiedAt).length;
        const teamConfig = (team.integrations[0]?.config as { coverageGoal?: number } | null) || {};
        const coverageGoal = teamConfig.coverageGoal || 80;

        // 4. Activity (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const versions = await db.docVersion.count({
            where: {
                documentation: { file: { teamId } },
                createdAt: { gte: thirtyDaysAgo }
            }
        });

        const reportData = {
            teamName: team.name,
            generatedAt: new Date().toISOString(),
            stats: {
                totalFiles,
                documentedFiles,
                coverage,
                coverageGoal,
                staleCount: staleFiles.length,
                verifiedCount,
                recentVersions: versions,
                memberCount: team._count.members
            },
            criticalUndocumented,
            files: files.map(f => ({
                name: f.name,
                lang: f.language,
                status: f.documentation?.status || "MISSING",
                isVerified: !!f.documentation?.verifiedAt,
                lastUpdated: f.updatedAt
            }))
        };

        return NextResponse.json(reportData);

    } catch (error) {
        console.error("[HealthData_API] Error:", error);
        return NextResponse.json({ error: "Failed to fetch health data" }, { status: 500 });
    }
}
