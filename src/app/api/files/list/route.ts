import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateQuery } from "@/lib/api-utils";
import { checkTeamPermission } from "@/lib/permissions";

const querySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

/**
 * GET /api/files/list
 * Returns a list of files for the authenticated user, optionally filtered by team.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Rate limiting
        await enforceRateLimit(session.user.id, "api");

        const { searchParams } = new URL(request.url);
        const { teamId } = validateQuery(searchParams, querySchema);

        const where: any = {};

        if (teamId) {
            // Verify team access
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
            if (!hasPermission) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            where.teamId = teamId;
        } else {
            // Personal files only (no team)
            where.userId = session.user.id;
            where.teamId = null;
        }

        const files = await db.file.findMany({
            where,
            select: {
                id: true,
                name: true,
                language: true,
                createdAt: true,
                size: true
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json({ files });
    } catch (error) {
        return errorResponse(error);
    }
}
