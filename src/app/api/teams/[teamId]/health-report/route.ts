import { File, Documentation, TeamMember, User, Integration } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
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
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

function hasValidSystemToken(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return false;
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return false;
    }

    const providedToken = authHeader.slice("Bearer ".length);
    const expectedBuffer = Buffer.from(cronSecret);
    const providedBuffer = Buffer.from(providedToken);

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
}

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
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const { teamId } = parsedParams.data;

        const isSystemAction = hasValidSystemToken(request);

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
                throw ApiErrors.unauthorized();
            }
            performerId = session.user.id;

            await enforceRateLimit(performerId, "api");

            const membership = await db.teamMember.findUnique({
                where: {
                    teamId_userId: { teamId, userId: performerId },
                },
            });

            if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
                throw ApiErrors.forbidden("Team Admin access required");
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
            throw ApiErrors.notFound("Team");
        }

        const files = await db.file.findMany({
            where: { teamId },
            include: { documentation: true },
        });

        const totalFiles = files.length;
        const documentedFiles = files.filter((f: File & { documentation: Documentation | null }) => f.documentation).length;
        const coverage = totalFiles > 0 ? Math.round((documentedFiles / totalFiles) * 100) : 0;

        const staleFiles = files.filter((f: File & { documentation: Documentation | null }) => {
            if (!f.documentation) return false;
            const fileUpdated = new Date(f.updatedAt).getTime();
            const docUpdated = new Date(f.documentation.updatedAt).getTime();
            return fileUpdated > docUpdated + 300000;
        });

        const stats = {
            coverage,
            totalFiles,
            documentedFiles,
            staleCount: staleFiles.length,
            coverageGoal:
                ((team.integrations.find((i: Integration) => i.type === "TEAM_CONFIG")?.config as { coverageGoal?: number } | null)
                    ?.coverageGoal) || 80,
        };

        const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard?teamId=${teamId}`;

        const emailPromises = team.members
            .filter((m: TeamMember & { user: User }) => m.user.email)
            .map((m: TeamMember & { user: User }) =>
                sendEmail({
                    to: m.user.email!,
                    subject: `Team Health Report: ${team.name}`,
                    html: emailTemplates.teamHealthReport(team.name, stats, dashboardUrl),
                }),
            );

        const emailResults = await Promise.allSettled(emailPromises);
        const successCount = emailResults.filter((r: PromiseSettledResult<any>) => r.status === "fulfilled").length;

        try {
            const goalStatus =
                stats.coverage >= stats.coverageGoal ? "✅ TARGET MET" : `📉 ${stats.coverageGoal - stats.coverage}% BELOW TARGET`;
            const healthSummary =
                `Documentation Health Summary for *${team.name}*:\n\n` +
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
        } catch {
            // Keep health-report flow non-blocking on notification channel issues.
        }

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
        } catch {
            // Keep health-report flow non-blocking when audit logging degrades.
        }

        return NextResponse.json({
            success: true,
            message: `Health report sent to ${successCount} members`,
            stats,
            targetGoal: stats.coverageGoal,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
