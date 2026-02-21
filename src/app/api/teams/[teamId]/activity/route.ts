import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    teamId: z.string().trim().min(1).max(100),
}).strict();

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

/**
 * GET /api/teams/[teamId]/activity
 * Fetch recent activity for a team from audit logs.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ teamId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid teamId" }, { status: 400 });
        }
        const { teamId } = parsedParams.data;

        const parsedQuery = querySchema.safeParse({
            limit: new URL(request.url).searchParams.get("limit") ?? 20,
        });
        if (!parsedQuery.success) {
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
        }
        const { limit } = parsedQuery.data;

        const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
        if (!hasPermission) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        console.error("[TeamActivity_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
