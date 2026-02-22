import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateQuery, ApiErrors } from "@/lib/api-utils";
import { decrypt } from "@/lib/security/encryption";

const querySchema = z.object({
    owner: z.string().trim().min(1).max(100),
    repo: z.string().trim().min(1).max(100),
}).strict();

/**
 * GET /api/github/repos/pulls
 * Lists pull requests for a specific GitHub repository.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Query Params
        const { searchParams } = new URL(req.url);
        const { owner, repo } = validateQuery(searchParams, querySchema);

        // 3. Fetch token from DB and decrypt
        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id }
        });

        if (!connection || !connection.accessToken) {
            return errorResponse(ApiErrors.badRequest("GitHub account not connected."));
        }

        let decryptedToken: string;
        try {
            decryptedToken = decrypt(connection.accessToken);
        } catch (e) {
            console.error("Token decryption failed:", e);
            return errorResponse(ApiErrors.internalError("Failed to access GitHub credentials."));
        }

        // 4. Fetch from GitHub API
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            headers: {
                "Authorization": `Bearer ${decryptedToken}`,
                "Accept": "application/vnd.github.v3+json",
            }
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return NextResponse.json({ error: err.message || "Failed to fetch PRs from GitHub" }, { status: res.status });
        }

        const pulls = await res.json();
        return NextResponse.json({ pulls });

    } catch (error) {
        return errorResponse(error);
    }
}
