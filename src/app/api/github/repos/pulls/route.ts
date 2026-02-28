import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateQuery, ApiErrors } from "@/lib/api-utils";
import { decrypt } from "@/lib/security/encryption";

const querySchema = z
    .object({
        owner: z.string().trim().min(1).max(100),
        repo: z.string().trim().min(1).max(100),
    })
    .strict();

/**
 * GET /api/github/repos/pulls
 * Lists pull requests for a specific GitHub repository.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { owner, repo } = validateQuery(req.nextUrl.searchParams, querySchema);

        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id },
            select: { accessToken: true },
        });

        if (!connection?.accessToken) {
            throw ApiErrors.badRequest("GitHub account not connected.");
        }

        let decryptedToken: string;
        try {
            decryptedToken = decrypt(connection.accessToken);
        } catch {
            throw ApiErrors.internalError("Failed to access GitHub credentials.");
        }

        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            headers: {
                Authorization: `Bearer ${decryptedToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        if (!res.ok) {
            if (res.status === 401) {
                throw ApiErrors.unauthorized("GitHub token is invalid or expired.");
            }

            throw ApiErrors.serviceUnavailable("GitHub API");
        }

        const pulls = await res.json();
        return NextResponse.json({ pulls });
    } catch (error) {
        return errorResponse(error);
    }
}
