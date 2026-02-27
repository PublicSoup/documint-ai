import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

const querySchema = z
    .object({
        days: z.coerce.number().int().min(1).max(365).default(30),
    })
    .strict();

type ScoreStats = {
    points: number;
    approvals: number;
    updates: number;
    creations: number;
};

/**
 * GET /api/teams/[teamId]/leaderboard
 * Calculate member contribution scores from team-scoped audit logs.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const gateError = await requireFeature("analytics");
        if (gateError) {
            return gateError;
        }

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const { days } = validateQuery(request.nextUrl.searchParams, querySchema);
        const { teamId } = parsedParams.data;

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            throw ApiErrors.forbidden();
        }

        const members = await db.teamMember.findMany({
            where: { teamId },
            include: {
                user: {
                    select: { id: true, name: true, email: true, image: true },
                },
            },
        });

        if (members.length === 0) {
            return NextResponse.json({ leaderboard: [], days });
        }

        const teamFiles = await db.file.findMany({
            where: { teamId },
            select: { id: true },
        });

        const fileIds = teamFiles.map((file) => file.id);

        const since = new Date();
        since.setDate(since.getDate() - days);

        const logs = await db.auditLog.findMany({
            where: {
                userId: { in: members.map((member) => member.userId) },
                action: { in: ["APPROVE", "UPDATE", "ANALYZE", "CREATE_FILE", "VERIFY"] },
                createdAt: { gte: since },
                OR: [
                    { entityId: teamId },
                    ...(fileIds.length > 0 ? [{ entityId: { in: fileIds } }] : []),
                ],
            },
            select: { userId: true, action: true },
        });

        const scoreMap = new Map<string, ScoreStats>();
        for (const member of members) {
            scoreMap.set(member.userId, { points: 0, approvals: 0, updates: 0, creations: 0 });
        }

        for (const log of logs) {
            if (!log.userId) {
                continue;
            }

            const stats = scoreMap.get(log.userId);
            if (!stats) {
                continue;
            }

            if (log.action === "APPROVE" || log.action === "VERIFY") {
                stats.points += 15;
                stats.approvals += 1;
            } else if (log.action === "UPDATE") {
                stats.points += 5;
                stats.updates += 1;
            } else if (log.action === "ANALYZE" || log.action === "CREATE_FILE") {
                stats.points += 10;
                stats.creations += 1;
            }
        }

        const leaderboard = members
            .map((member) => {
                const fallbackStats: ScoreStats = { points: 0, approvals: 0, updates: 0, creations: 0 };
                const stats = scoreMap.get(member.userId) ?? fallbackStats;

                return {
                    userId: member.userId,
                    name: member.user.name || member.user.email?.split("@")[0] || "Unknown",
                    image: member.user.image,
                    role: member.role,
                    ...stats,
                };
            })
            .sort((a, b) => b.points - a.points);

        return NextResponse.json({ leaderboard, days });
    } catch (error) {
        return errorResponse(error);
    }
}
