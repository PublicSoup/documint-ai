import { z } from "zod";
import { db } from "@/lib/db";
import { createApiHandler, ApiErrors } from "@/lib/api-utils";

const emptySchema = z.object({}).strict();

/**
 * POST /api/github/disconnect
 * Removes the GitHub connection for the authenticated user.
 */
export const POST = createApiHandler({
    rateLimit: "api",
    bodySchema: emptySchema,
    audit: {
        action: "GITHUB_DISCONNECT",
        entity: "User",
        entityId: ({ userId }) => userId,
    },
    handler: async ({ userId }) => {
        const connection = await db.gitHubConnection.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!connection) {
            throw ApiErrors.notFound("GitHub connection");
        }

        await db.gitHubConnection.delete({ where: { userId } });

        return { success: true, message: "GitHub disconnected successfully" };
    },
});
