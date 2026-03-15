import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { errorResponse, ApiErrors, validateBody } from "../../../../lib/api-utils";

const emptySchema = z.object({}).strict();

/**
 * POST /api/github/disconnect
 * Removes the GitHub connection for the authenticated user.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await validateBody(req, emptySchema);
        await enforceRateLimit(session.user.id, "api");

        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
        });

        if (!connection) {
            throw ApiErrors.notFound("GitHub connection");
        }

        await db.gitHubConnection.delete({
            where: { userId: session.user.id },
        });

        try {
            const { logAudit } = await import("../../../../lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GITHUB_DISCONNECT",
                entity: "User",
                entityId: session.user.id,
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ success: true, message: "GitHub disconnected successfully" });
    } catch (error) {
        return errorResponse(error);
    }
}
