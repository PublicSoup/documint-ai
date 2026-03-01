import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";
import { checkTeamPermission } from "@/lib/permissions";

const querySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).optional(), // Support cursor-based pagination
}).strict();

/**
 * GET /api/files/list
 * Returns a list of files for the authenticated user, optionally filtered by team.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // Rate limiting
        await enforceRateLimit(session.user.id, "api");

        const { searchParams } = new URL(request.url);
        const { teamId, limit, cursor } = validateQuery(searchParams, querySchema);

        const where: Prisma.FileWhereInput = {};

        if (teamId) {
            // Verify team access
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
            if (!hasPermission) {
                throw ApiErrors.forbidden();
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
                updatedAt: true,
                size: true
            },
            orderBy: {
                updatedAt: "desc", // Usually more relevant than createdAt
            },
            take: limit,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
        });

        const nextCursor = files.length === limit ? files[files.length - 1].id : undefined;

        return NextResponse.json({ 
            files,
            nextCursor 
        });
    } catch (error) {
        return errorResponse(error);
    }
}
