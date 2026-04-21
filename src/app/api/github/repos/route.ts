import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { z } from "zod";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { errorResponse, validateQuery, ApiErrors } from "../../../../lib/api-utils";
import { decrypt } from "../../../../lib/security/encryption";

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

/**
 * GET /api/github/repos
 * Lists the authenticated user's GitHub repositories.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Query Params
        const { page, per_page } = validateQuery(req.nextUrl.searchParams, querySchema);

        // 3. Fetch token from DB and decrypt
        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id }
        });

        if (!connection || !connection.accessToken) {
            return NextResponse.json({
                repos: [],
                connected: false,
            });
        }

        let decryptedToken: string;
        try {
            decryptedToken = decrypt(connection.accessToken);
        } catch {
            throw ApiErrors.internalError("Failed to access GitHub credentials.");
        }

        // 4. Fetch from GitHub API
        const res = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=${per_page}&page=${page}`, {
            headers: {
                Authorization: `Bearer ${decryptedToken}`,
                Accept: "application/vnd.github.v3+json",
            },
            next: { revalidate: 60 },
        });

        if (!res.ok) {
            if (res.status === 401) {
                throw ApiErrors.unauthorized("GitHub token is invalid or expired.");
            }

            throw ApiErrors.serviceUnavailable("GitHub API");
        }

        const repos = (await res.json()) as Array<{
            id: number;
            name: string;
            full_name: string;
            language: string | null;
            updated_at: string;
            private: boolean;
            description?: string | null;
            default_branch: string;
        }>;

        return NextResponse.json({
            repos: repos.map((repo) => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                language: repo.language,
                updated_at: repo.updated_at,
                private: repo.private,
                description: repo.description,
                default_branch: repo.default_branch,
            })),
            connected: true
        });
    } catch (error) {
        return errorResponse(error);
    }
}
