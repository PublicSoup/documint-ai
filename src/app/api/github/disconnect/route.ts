import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { errorResponse, ApiErrors } from "../../../../lib/api-utils";

/**
 * POST /api/github/disconnect
 * Removes the GitHub connection for the authenticated user.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Check if connection exists
        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id },
            select: { id: true }
        });

        if (!connection) {
            return errorResponse(ApiErrors.notFound("GitHub connection"));
        }

        // 3. Delete connection
        await db.gitHubConnection.delete({
            where: { userId: session.user.id }
        });

        // 4. Audit Log
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
