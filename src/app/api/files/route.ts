import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createApiHandler, ApiErrors, validateQuery, errorResponse } from "@/lib/api-utils";
import { getClientIP } from "@/lib/rate-limit";

const querySchema = z.object({}).strict();

/**
 * GET /api/files
 * Retrieves the file tree for the authenticated user.
 */
export const GET = createApiHandler({
    querySchema: querySchema,
    rateLimit: "api",
    cacheControl: "private, max-age=60, stale-while-revalidate=300",
    handler: async ({ session, query, request }) => {
        try {
            // 1. Get the list of teams the user is a member of
            const userTeams = await db.teamMember.findMany({
                where: { userId: session.user.id },
                select: { teamId: true },
            });
            const userTeamIds = userTeams.map((tm: { teamId: string }) => tm.teamId);

            // 2. Find files that are either owned by the user or belong to a team they are in
            const files = await db.file.findMany({
                where: {
                    OR: [
                        { userId: session.user.id },
                        { teamId: { in: userTeamIds } },
                    ],
                },
                orderBy: {
                    name: "asc",
                },
            });
            return files;
        } catch (error) {
            throw ApiErrors.internalError("Failed to retrieve files");
        }
    },
    audit: {
        action: "FILES_GET",
        entity: "File",
        entityId: () => "N/A", // No specific entity ID for a bulk get operation
    }
});

