import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

const DRIFT_BUFFER_MS = 5 * 60 * 1000;

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
 * POST /api/teams/[teamId]/rescan
 * Batch detect documentation drift across all files in a team and mark drifted docs as DRAFT.
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

        let performerId: string | null = null;

        if (isSystemAction) {
            performerId = "SYSTEM";
        } else {
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                throw ApiErrors.unauthorized();
            }

            performerId = session.user.id;

            const hasPermission = await checkTeamPermission(performerId, teamId, "manage");
            if (!hasPermission) {
                throw ApiErrors.forbidden("Admin access required");
            }

            await enforceRateLimit(performerId, "api");
        }

        const team = await db.team.findUnique({
            where: { id: teamId },
            select: { id: true },
        });

        if (!team) {
            throw ApiErrors.notFound("Team");
        }

        const files = await db.file.findMany({
            where: { teamId },
            include: { documentation: true },
        });

        const driftDetectedIds: string[] = [];
        let documentedFiles = 0;

        for (const file of files) {
            if (!file.documentation) continue;

            documentedFiles += 1;

            const fileUpdatedAt = file.updatedAt.getTime();
            const docUpdatedAt = file.documentation.updatedAt.getTime();

            if (fileUpdatedAt > docUpdatedAt + DRIFT_BUFFER_MS) {
                driftDetectedIds.push(file.documentation.id);
            }
        }

        if (driftDetectedIds.length > 0) {
            await db.documentation.updateMany({
                where: {
                    id: { in: driftDetectedIds },
                    status: { not: "DRAFT" },
                },
                data: { status: "DRAFT" },
            });
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: performerId,
                action: "TEAM_RESCAN",
                entity: "Team",
                entityId: teamId,
                details: {
                    totalFiles: files.length,
                    documentedFiles,
                    driftDetected: driftDetectedIds.length,
                    isScheduled: isSystemAction,
                },
            });
        } catch {
            // Keep endpoint non-blocking if audit logging fails.
        }

        if (driftDetectedIds.length > 0) {
            try {
                await sendNotification({
                    userId: performerId === "SYSTEM" ? undefined : performerId,
                    teamId,
                    type: "BATCH_DRIFT",
                    title: "Team Project Drift Detected",
                    message: `A project-wide rescan detected **${driftDetectedIds.length}** files out of sync. They have been marked as DRAFT for review.`,
                });
            } catch {
                // Keep endpoint non-blocking if notifications fail.
            }
        }

        return NextResponse.json({
            success: true,
            message: `Rescan complete. Found ${driftDetectedIds.length} out-of-sync files.`,
            stats: {
                total: files.length,
                scanned: documentedFiles,
                drift: driftDetectedIds.length,
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}
