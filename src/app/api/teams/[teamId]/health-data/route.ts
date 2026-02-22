import { NextRequest, NextResponse } from \"next/server\";
import { getServerSession } from \"next-auth\";
import { authOptions } from \"@/lib/auth\";
import { db } from \"@/lib/db\";
import { checkTeamPermission } from \"@/lib/permissions\";
import { requireFeature } from \"@/lib/feature-gate\";
import { enforceRateLimit } from \"@/lib/rate-limit\";
import { errorResponse, ApiErrors } from \"@/lib/api-utils\";
import { z } from \"zod\";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

/**
 * GET /api/teams/[teamId]/health-data
 * Fetch detailed documentation health data for reporting.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const gateError = await requireFeature(\"analytics\");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, \"api\");

        // 2. Validate Params
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest(\"Invalid team ID\"));
        }
        const { teamId } = parsedParams.data;

        // 3. Check permissions
        const hasPermission = await checkTeamPermission(session.user.id, teamId, \"view\");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden());
        }

        // 4. Fetch team info
        const team = await db.team.findUnique({
            where: { id: teamId },
            include: {
                _count: { select: { members: true } },
                integrations: {
                    where: { type: \"TEAM_CONFIG\" },
                    take: 1,
                    select: { config: true }
                }
            }
        });

        if (!team) {
            return errorResponse(ApiErrors.notFound(\"Team\"));
        }

        // 5. Fetch all files and docs
        const files = await db.file.findMany({
            where: { teamId },
            include: {
                documentation: {
                    select: { status: true, updatedAt: true, verifiedAt: true }
                }
            }
        });

        // 6. Aggregate stats
        const totalFiles = files.length;
        const documentedFiles = files.filter(f => f.documentation).length;
        const coverage = totalFiles > 0 ? Math.round((documentedFiles / totalFiles) * 100) : 0;
        
        const staleFiles = files.filter(f => {
            if (!f.documentation) return false;
            // Drift detection: code updated more than 5 minutes after doc update
            return new Date(f.updatedAt).getTime() > new Date(f.documentation.updatedAt).getTime() + 300000;
        });

        // Identify critical undocumented components (hotspots)
        const criticalUndocumented = files
            .filter(f => !f.documentation)
            .map(f => ({
                name: f.name,
                size: f.size,
                lang: f.language,
                riskScore: Math.min(100, Math.round((f.size / 2000) * 70) + (f.name.includes(\"api\") ? 20 : 0) + (f.language === \"typescript\" || f.language === \"javascript\" ? 10 : 0))
            }))
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 5);

        const verifiedCount = files.filter(f => f.documentation?.verifiedAt).length;
        const teamConfigRaw = team.integrations[0]?.config;
        const teamConfig = (teamConfigRaw && typeof teamConfigRaw === \"object\" ? teamConfigRaw : {}) as { coverageGoal?: number };
        const coverageGoal = teamConfig.coverageGoal ?? 80;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const versionsCount = await db.docVersion.count({
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
                recentVersions: versionsCount,
                memberCount: team._count.members
            },
            criticalUndocumented,
            files: files.map(f => ({
                name: f.name,
                lang: f.language,
                status: f.documentation?.status || \"MISSING\",
                isVerified: !!f.documentation?.verifiedAt,
                lastUpdated: f.updatedAt
            }))
        };

        return NextResponse.json(reportData);

    } catch (error) {
        return errorResponse(error);
    }
}
