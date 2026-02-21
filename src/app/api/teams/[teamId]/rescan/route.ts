import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const DRIFT_BUFFER_MS = 5 * 60 * 1000;

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
            return NextResponse.json({ error: "Invalid team ID" }, { status: 400 });
        }

        const { teamId } = parsedParams.data;

        const authHeader = request.headers.get("authorization");
        const isSystemAction = authHeader === `Bearer ${process.env.CRON_SECRET}`;

        let performerId: string | null = null;

        if (isSystemAction) {
            performerId = "SYSTEM";
        } else {
            const session = await getServerSession(authOptions);
            if (!session?.user?.id) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }

            performerId = session.user.id;

            const hasPermission = await checkTeamPermission(performerId, teamId, "manage");
            if (!hasPermission) {
                return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
            }

            await enforceRateLimit(performerId, "api");
        }

        const team = await db.team.findUnique({
            where: { id: teamId },
            select: { id: true },
        });

        if (!team) {
            return NextResponse.json({ error: "Team not found" }, { status: 404 });
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
        console.error("[TeamRescan_API] Error:", error);
        return NextResponse.json({ error: "Failed to perform project rescan" }, { status: 500 });
    }
}
