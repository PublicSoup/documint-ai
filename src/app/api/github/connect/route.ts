import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

// GitHub OAuth flow - Step 1: Redirect to GitHub
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        return NextResponse.json({ error: "GitHub integration not configured" }, { status: 500 });
    }

    const redirectUri = `${process.env.NEXTAUTH_URL}/api/github/callback`;
    const scope = "repo read:user";
    const state = session.user.id; // Use user ID as state for security

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

    return NextResponse.redirect(authUrl);
}
