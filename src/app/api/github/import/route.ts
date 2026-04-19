import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../../../../lib/auth";
import { resolveUserId } from "../../../../lib/resolve-user";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "../../../../lib/api-utils";
import { inngest } from "@/inngest/client";
import { getUserSubscription } from "../../../../lib/subscription";
import { decrypt } from "../../../../lib/security/encryption";
import { db } from "../../../../lib/db";

const githubImportSchema = z.object({
    owner: z.string().trim().min(1).max(100),
    repo: z.string().trim().min(1).max(100),
    branch: z.string().trim().max(100).default("main"),
    path: z.string().trim().max(1024).default(""),
    teamId: z.string().trim().min(1).max(100).optional(),
}).strict();

/**
 * POST /api/github/import
 * Triggers a multi-file GitHub repository import in the background using Inngest.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "upload");

        const body = await validateBody(req, githubImportSchema);
        const { owner, repo, branch, path, teamId } = body;

        const userId = await resolveUserId(session);
        if (!userId) {
            throw ApiErrors.notFound("User");
        }

        // 2. Fetch GitHub Connection and decrypt token
        const connection = await db.gitHubConnection.findUnique({
            where: { userId }
        });

        if (!connection || !connection.accessToken) {
            throw ApiErrors.badRequest("GitHub account not connected.");
        }

        let decryptedToken: string;
        try {
            decryptedToken = decrypt(connection.accessToken);
        } catch {
            throw ApiErrors.internalError("Failed to access GitHub credentials.");
        }

        // 3. Verify Team Access if applicable
        if (teamId) {
            const { checkTeamPermission } = await import("@/lib/permissions");
            const hasPermission = await checkTeamPermission(userId, teamId, "edit");
            if (!hasPermission) {
                throw ApiErrors.forbidden("You do not have permission to import to this team.");
            }
        }

        const subscription = await getUserSubscription(userId);
        const maxFiles = subscription.limits.filesPerMonth === -1 ? 100 : Math.min(subscription.limits.filesPerMonth, 100);

        // 4. Dispatch the persistent Background Job
        const { ids } = await inngest.send({
            name: "github.repo.import",
            data: {
                owner,
                repo,
                branch,
                path,
                teamId: teamId || null,
                userId,
                token: decryptedToken,
                maxFiles
            }
        });

        return NextResponse.json({
            status: "processing",
            jobId: ids[0],
            message: "GitHub repository import has been queued and is processing securely in the background.",
        }, { status: 202 });

    } catch (error) {
        return errorResponse(error);
    }
}
