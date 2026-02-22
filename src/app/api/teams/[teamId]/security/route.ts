import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { checkTeamPermission } from "@/lib/permissions";
import { safeJsonParse } from "@/lib/utils";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { z } from "zod";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

/**
 * GET /api/teams/[teamId]/security
 * Aggregates all AI-detected security insights across the team's project.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Params
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid team ID"));
        }
        const { teamId } = parsedParams.data;

        // 3. Check permissions
        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden());
        }

        // 4. Fetch all documented files for this team
        const files = await db.file.findMany({
            where: { teamId },
            include: {
                documentation: {
                    select: { content: true, updatedAt: true }
                }
            }
        });

        const securityInsights: {
            fileId: string;
            fileName: string;
            insight: string;
            severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
            updatedAt: Date;
        }[] = [];

        // 5. Parse and aggregate insights
        files.forEach(file => {
            if (file.documentation?.content) {
                const doc = safeJsonParse(file.documentation.content, { securityInsights: [] as string[] }) as { securityInsights?: string[] };
                if (doc.securityInsights && Array.isArray(doc.securityInsights)) {
                    doc.securityInsights.forEach((insight: string) => {
                        let severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
                        const lower = insight.toLowerCase();
                        if (lower.includes("critical") || lower.includes("vulnerability") || lower.includes("exploit")) severity = "CRITICAL";
                        else if (lower.includes("high") || lower.includes("risk") || lower.includes("security")) severity = "HIGH";
                        else if (lower.includes("low") || lower.includes("notice") || lower.includes("info")) severity = "LOW";

                        securityInsights.push({
                            fileId: file.id,
                            fileName: file.name,
                            insight,
                            severity,
                            updatedAt: file.documentation!.updatedAt
                        });
                    });
                }
            }
        });

        // 6. Sort by severity and date
        const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const sortedInsights = securityInsights.sort((a, b) => {
            if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                return severityOrder[a.severity] - severityOrder[b.severity];
            }
            return b.updatedAt.getTime() - a.updatedAt.getTime();
        });

        return NextResponse.json({ 
            insights: sortedInsights,
            stats: {
                total: securityInsights.length,
                critical: securityInsights.filter(i => i.severity === "CRITICAL").length,
                high: securityInsights.filter(i => i.severity === "HIGH").length
            }
        });

    } catch (error) {
        return errorResponse(error);
    }
}
