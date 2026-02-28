import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

// GitHub OAuth flow - Step 1: Redirect to GitHub
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const clientId = env.GITHUB_CLIENT_ID;
        if (!clientId) {
            throw ApiErrors.internalError("GitHub integration not configured");
        }

        const redirectUri = `${env.NEXTAUTH_URL}/api/github/callback`;
        const scope = "repo read:user";
        const state = session.user.id; // Use user ID as state for security

        const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

        return NextResponse.redirect(authUrl);
    } catch (error) {
        return errorResponse(error);
    }
}
