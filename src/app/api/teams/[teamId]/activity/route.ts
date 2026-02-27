import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const paramsSchema = z
    .object({
        teamId: z.string().trim().min(1).max(100),
    })
    .strict();

const querySchema = z
    .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict();

/**
 * GET /api/teams/[teamId]/activity
 * Fetch recent activity for a team from audit logs.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> },
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid team ID", parsedParams.error.flatten());
        }

        const { limit } = validateQuery(request.nextUrl.searchParams, querySchema);
        const { teamId } = parsedParams.data;

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            throw ApiErrors.forbidden();
        }

        const teamFiles = await db.file.findMany({
            where: { teamId },
            select: { id: true },
        });

        const fileIds = teamFiles.map((file) => file.id);

        const logs = await db.auditLog.findMany({
            where: {
                OR: [
                    { entityId: teamId },
                    ...(fileIds.length > 0 ? [{ entityId: { in: fileIds } }] : []),
                ],
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            include: {
                user: {
                    select: { name: true, image: true, email: true },
                },
            },
        });

        return NextResponse.json({ logs, total: logs.length });
    } catch (error) {
        return errorResponse(error);
    }
}
