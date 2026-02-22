import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { sendEmail, emailTemplates } from "@/lib/email";
import { env } from "@/lib/env";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

/**
 * POST /api/teams/[teamId]/health-report
 * Manually trigger a documentation health report for the entire team.
 * Requires Team ADMIN or OWNER role.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        // 0. System Authentication Check (Bypass for Cron)
        const authHeader = request.headers.get("authorization");
        const isSystemAction = authHeader === `Bearer ${process.env.CRON_SECRET}`;

        // 1. Check feature access (Enterprise feature)
        // System actions are assumed to have passed feature gates at the trigger level
        if (!isSystemAction) {
            const gateError = await requireFeature("analytics");
            if (gateError) return gateError;
        }

        let performerId: string | null = null;

        if (isSystemAction) {
            performerId = "SYSTEM";
        } else {
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            performerId = session.user.id;

            await enforceRateLimit(performerId, "api");

            // 2. Verify caller is Team Admin/Owner
            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: { teamId, userId: performerId },
                },
            });

            if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
                return NextResponse.json({ error: "Forbidden: Team Admin access required" }, { status: 403 });
            }
        }

        const team = await db.team.findUnique({
            where: { id: teamId },
            include: {
                members: {
                    include: { user: { select: { email: true, name: true, settings: true } } },
                },
                integrations: {
                    where: { isActive: true },
                },
            },
        });

        if (!team) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
        }

        // 3. Aggregate Stats
        const files = await db.file.findMany({
            where: { teamId },
            include: { documentation: true },
        });

        const totalFiles = files.length;
        const documentedFiles = files.filter((f) => f.documentation).length;
        const coverage = totalFiles > 0 ? Math.round((documentedFiles / totalFiles) * 100) : 0;

        // Drift Detection: Code updated after Docs
        const staleFiles = files.filter((f) => {
            if (!f.documentation) return false;
            const fileUpdated = new Date(f.updatedAt).getTime();
            const docUpdated = new Date(f.documentation.updatedAt).getTime();
            return fileUpdated > docUpdated + 300000; // 5 min drift buffer
        });

        const stats = {
            coverage,
            totalFiles,
            documentedFiles,
            staleCount: staleFiles.length,
            coverageGoal: ((team.integrations.find((i) => i.type === "TEAM_CONFIG")?.config as { coverageGoal?: number } | null)?.coverageGoal) || 80,
        };

        // 4. Send Emails to all team members
        const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard?teamId=${teamId}`;

        const emailPromises = team.members
            .filter((m) => m.user.email)
            .map((m) => sendEmail({
                to: m.user.email!,
                subject: `Team Health Report: ${team.name}`,
                html: emailTemplates.teamHealthReport(team.name, stats, dashboardUrl),
            }));

        // Use Promise.allSettled to ensure one bad email doesn't block others
        const emailResults = await Promise.allSettled(emailPromises);
        const successCount = emailResults.filter((r) => r.status === "fulfilled").length;

        // 5. Webhook Notifications (Team Channel + Owner)
        try {
            const goalStatus = stats.coverage >= stats.coverageGoal ? "✅ TARGET MET" : `📉 ${stats.coverageGoal - stats.coverage}% BELOW TARGET`;
            const healthSummary = `Documentation Health Summary for *${team.name}*:\n\n` +
                `• Coverage: ${stats.coverage}% (${goalStatus})\n` +
                `• Target: ${stats.coverageGoal}%\n` +
                `• Status: ${stats.documentedFiles} of ${stats.totalFiles} files documented\n` +
                `• Stale Docs: ${stats.staleCount} out of sync\n\n` +
                `Dashboard: ${dashboardUrl}`;

            await sendNotification({
                userId: isSystemAction ? undefined : performerId!,
                teamId,
                type: "TEAM_HEALTH",
                title: `Team Health Report: ${team.name}`,
                message: healthSummary,
            });
        } catch (webhookErr) {
            console.error("Webhook notification logic failed for health report:", webhookErr);
        }

        // 6. Audit Log (High Integrity)
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: performerId,
                action: "GENERATE_HEALTH_REPORT",
                entity: "Team",
                entityId: teamId,
                details: {
                    ...stats,
                    recipientCount: team.members.length,
                    successfulSends: successCount,
                    isScheduled: isSystemAction,
                },
            });
        } catch (e) {
            console.error("Failed to audit log health report generation", e);
        }

        return NextResponse.json({
            success: true,
            message: `Health report sent to ${successCount} members`,
            stats,
            targetGoal: stats.coverageGoal,
        });
    } catch (error) {
        console.error("[HealthReport_API] Error:", error);
        return NextResponse.json({ error: "Failed to generate health report" }, { status: 500 });
    }
}
