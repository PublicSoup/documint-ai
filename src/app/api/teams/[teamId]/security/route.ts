import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { checkTeamPermission } from "@/lib/permissions";
import { safeJsonParse } from "@/lib/utils";

/**
 * GET /api/teams/[teamId]/security
 * Aggregates all AI-detected security insights across the team's project.
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

        // 1. Fetch all documented files for this team
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

        // 2. Parse and aggregate insights
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

        // 3. Sort by severity and date
        const severityMap: Record<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW", number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const sortedInsights = securityInsights.sort((a, b) => {
            if (severityMap[a.severity] !== severityMap[b.severity]) {
                return severityMap[a.severity] - severityMap[b.severity];
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
        console.error("[TeamSecurity_API] Error:", error);
        return NextResponse.json({ error: "Failed to aggregate security insights" }, { status: 500 });
    }
}
