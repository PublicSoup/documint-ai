import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "../../../../lib/api-utils";
import { decrypt } from "../../../../lib/security/encryption";

const createRepoSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    isPrivate: z.boolean().default(true),
    autoInit: z.boolean().default(true),
}).strict();

/**
 * POST /api/github/create
 * Creates a new GitHub repository for the authenticated user.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Body
        const { name, description, isPrivate, autoInit } = await validateBody(req, createRepoSchema);

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

        // 4. Create the repository via GitHub API
        const gitRes = await fetch("https://api.github.com/user/repos", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${decryptedToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                description,
                private: isPrivate,
                auto_init: autoInit,
            }),
        });

        if (!gitRes.ok) {
            const errorData = await gitRes.json().catch(() => ({}));
            return NextResponse.json({
                error: errorData.message || "Failed to create repository on GitHub"
            }, { status: gitRes.status });
        }

        const repoData = await gitRes.json();

        // 5. Audit Logging
        try {
            const { logAudit } = await import("../../../../lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GITHUB_CREATE_REPO",
                entity: "GitHubRepository",
                entityId: repoData.id.toString(),
                details: { 
                    name: repoData.name, 
                    fullName: repoData.full_name,
                    private: repoData.private
                }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            message: "Repository created successfully",
            repo: {
                id: repoData.id,
                name: repoData.name,
                full_name: repoData.full_name,
                html_url: repoData.html_url,
                private: repoData.private,
            }
        }, { status: 201 });
    } catch (error) {
        return errorResponse(error);
    }
}
