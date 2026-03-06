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
    handler: async ({ session, query, request }) => {
        try {
            const files = await db.file.findMany({
                where: {
                    // Currently, files are scoped directly to the authenticated user.
                    // Multi-project or team-based file scoping is a planned future enhancement.
                    userId: session.user.id,
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

