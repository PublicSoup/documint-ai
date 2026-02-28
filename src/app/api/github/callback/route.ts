import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/security/encryption";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { validateQuery } from "@/lib/api-utils";

const querySchema = z
    .object({
        code: z.string().trim().min(1).max(500),
        state: z.string().trim().min(1).max(100),
    })
    .strict();

function buildSettingsRedirect(appBaseUrl: string, params: Record<string, string>): NextResponse {
    const redirectUrl = new URL("/dashboard/settings", appBaseUrl);
    Object.entries(params).forEach(([key, value]) => {
        redirectUrl.searchParams.set(key, value);
    });

    return NextResponse.redirect(redirectUrl);
}

/**
 * GET /api/github/callback
 * Handles the GitHub OAuth callback, exchanging the code for an access token.
 */
export async function GET(req: NextRequest) {
    const appBaseUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    try {
        const { code, state } = validateQuery(req.nextUrl.searchParams, querySchema);

        const session = await getServerSession(authOptions);
        if (!session?.user?.id || session.user.id !== state) {
            return buildSettingsRedirect(appBaseUrl, { github_error: "unauthorized" });
        }

        const ip = await getClientIP(req);
        await enforceRateLimit(ip, "auth");
        await enforceRateLimit(session.user.id, "api");

        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: env.GITHUB_CLIENT_ID,
                client_secret: env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenRes.json().catch(() => ({} as Record<string, unknown>));
        const accessToken = typeof tokenData.access_token === "string" ? tokenData.access_token : null;

        if (!tokenRes.ok || !accessToken) {
            return buildSettingsRedirect(appBaseUrl, { github_error: "token_failed" });
        }

        const userRes = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!userRes.ok) {
            return buildSettingsRedirect(appBaseUrl, { github_error: "user_fetch_failed" });
        }

        const githubUser = (await userRes.json()) as {
            id: number;
            login: string;
            avatar_url?: string;
        };

        const encryptedToken = encrypt(accessToken);

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

        const currentUser = await db.user.findUnique({
            where: { id: session.user.id },
            select: { image: true },
        });

        if (!currentUser?.image && githubUser.avatar_url) {
            await db.user
                .update({
                    where: { id: session.user.id },
                    data: { image: githubUser.avatar_url },
                })
                .catch(() => {
                    // Non-critical profile sync.
                });
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "GITHUB_CONNECT",
                entity: "GitHubConnection",
                entityId: githubUser.id.toString(),
                details: {
                    username: githubUser.login,
                },
            });
        } catch {
            // Non-blocking
        }

        return buildSettingsRedirect(appBaseUrl, { github_connected: "true" });
    } catch {
        return buildSettingsRedirect(appBaseUrl, { github_error: "callback_failed" });
    }
}
