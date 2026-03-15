import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { subDays } from "date-fns";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { File } from "@prisma/client";
import { checkTeamPermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const querySchema = z.object({
    days: z.coerce.number().int().min(1).max(90).default(7),
}).strict();

interface ContributorStat {
    name: string;
    image: string | null;
    count: number;
}

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

        const now = new Date();
        const thisWindowStart = subDays(now, days);
        const previousWindowStart = subDays(now, days * 2);

        const teamFiles = await db.file.findMany({
            where: { teamId },
            select: { id: true },
        });

        const fileIds = teamFiles.map((file: File) => file.id);

        const entityFilters: { entityId: string | { in: string[] } }[] = [{ entityId: teamId }];
        if (fileIds.length > 0) {
            entityFilters.push({ entityId: { in: fileIds } });
        }

        const logs = await db.auditLog.findMany({
            where: {
                OR: entityFilters,
                action: { in: ["APPROVE", "UPDATE", "ANALYZE", "CREATE_FILE", "VERIFY"] },
                createdAt: { gte: previousWindowStart },
            },
            include: {
                user: {
                    select: { name: true, email: true, image: true },
                },
            },
        });

        const stats = {
            currentWindow: { creations: 0, approvals: 0, updates: 0 },
            previousWindow: { creations: 0, approvals: 0, updates: 0 },
            contributors: new Map<string, ContributorStat>(),
        };

        for (const log of logs) {
            const isCurrentWindow = log.createdAt >= thisWindowStart;
            const target = isCurrentWindow ? stats.currentWindow : stats.previousWindow;

            if (log.action === "APPROVE" || log.action === "VERIFY") {
                target.approvals += 1;
            } else if (log.action === "UPDATE") {
                target.updates += 1;
            } else if (log.action === "ANALYZE" || log.action === "CREATE_FILE") {
                target.creations += 1;
            }

            if (isCurrentWindow && log.user && log.userId) {
                const current = stats.contributors.get(log.userId) ?? {
                    name: log.user.name || log.user.email?.split("@")[0] || "Unknown",
                    image: log.user.image,
                    count: 0,
                };
                current.count += 1;
                stats.contributors.set(log.userId, current);
            }
        }

        const topContributors = Array.from(stats.contributors.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        const creationsChange = stats.previousWindow.creations === 0
            ? (stats.currentWindow.creations > 0 ? 100 : 0)
            : Math.round(((stats.currentWindow.creations - stats.previousWindow.creations) / stats.previousWindow.creations) * 100);

        const approvalsChange = stats.previousWindow.approvals === 0
            ? (stats.currentWindow.approvals > 0 ? 100 : 0)
            : Math.round(((stats.currentWindow.approvals - stats.previousWindow.approvals) / stats.previousWindow.approvals) * 100);

        return NextResponse.json({
            trends: {
                creations: {
                    current: stats.currentWindow.creations,
                    previous: stats.previousWindow.creations,
                    change: creationsChange,
                },
                approvals: {
                    current: stats.currentWindow.approvals,
                    previous: stats.previousWindow.approvals,
                    change: approvalsChange,
                },
            },
            topContributors,
            totalActivity: stats.currentWindow.creations + stats.currentWindow.approvals + stats.currentWindow.updates,
            windowDays: days,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
