import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/security/encryption";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse, validateQuery } from "@/lib/api-utils";

const querySchema = z.object({
    code: z.string().min(1),
    state: z.string().min(1),
}).strict();

/**
 * GET /api/github/callback
 * Handles the GitHub OAuth callback, exchanging the code for an access token.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const appBaseUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    try {
        const { code, state } = validateQuery(searchParams, querySchema);

        const session = await getServerSession(authOptions);
        if (!session?.user?.id || session.user.id !== state) {
            return NextResponse.redirect(`${appBaseUrl}/dashboard/settings?github_error=unauthorized`);
        }

        // 1. Enforce Rate Limit (IP based initially as this is a sensitive callback)
        const ip = await getClientIP(req);
        await enforceRateLimit(ip, "auth");
        await enforceRateLimit(session.user.id, "api");

        // 2. Exchange code for access token
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: env.GITHUB_CLIENT_ID,
                client_secret: env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenRes.json().catch(() => ({}));

        if (tokenData.error || !tokenData.access_token) {
            console.error("GitHub token exchange error:", tokenData);
            return NextResponse.redirect(`${appBaseUrl}/dashboard/settings?github_error=token_failed`);
        }

        // 3. Get GitHub user info
        const userRes = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });

        if (!userRes.ok) {
            return NextResponse.redirect(`${appBaseUrl}/dashboard/settings?github_error=user_fetch_failed`);
        }

        const githubUser = await userRes.json();

        // 4. Store the connection (Encrypted)
        const encryptedToken = encrypt(tokenData.access_token);

        await db.gitHubConnection.upsert({
            where: { userId: session.user.id },
            update: {
                accessToken: encryptedToken,
                githubId: githubUser.id,
                username: githubUser.login,
                avatarUrl: githubUser.avatar_url,
                updatedAt: new Date(),
            },
            create: {
                userId: session.user.id,
                accessToken: encryptedToken,
                githubId: githubUser.id,
                username: githubUser.login,
                avatarUrl: githubUser.avatar_url,
            },
        });

        // 5. Update user profile image if they don't have one
        const currentUser = await db.user.findUnique({
            where: { id: session.user.id },
            select: { image: true }
        });

        if (!currentUser?.image && githubUser.avatar_url) {
            await db.user.update({
                where: { id: session.user.id },
                data: { image: githubUser.avatar_url }
            }).catch(() => {}); // Non-critical
        }

        // 6. Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GITHUB_CONNECT",
                entity: "GitHubConnection",
                entityId: githubUser.id.toString(),
                details: { 
                    username: githubUser.login,
                }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.redirect(`${appBaseUrl}/dashboard/settings?github_connected=true`);
    } catch (error) {
        console.error("GitHub callback handler error:", error);
        return NextResponse.json({ error: "Callback failed" }, { status: 500 });
    }
}
