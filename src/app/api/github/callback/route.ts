import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

// GitHub OAuth callback - Exchange code for token
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
        return NextResponse.redirect(`${env.NEXTAUTH_URL}/dashboard/billing?github_error=no_code`);
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.id !== state) {
        return NextResponse.redirect(`${env.NEXTAUTH_URL}/dashboard/billing?github_error=unauthorized`);
    }

    try {
        // Exchange code for access token
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

        const tokenData = await tokenRes.json();

        if (tokenData.error || !tokenData.access_token) {
            console.error("GitHub token error:", tokenData);
            return NextResponse.redirect(`${env.NEXTAUTH_URL}/dashboard/billing?github_error=token_failed`);
        }

        // Get GitHub user info
        const userRes = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });
        const githubUser = await userRes.json();

        // Store the connection
        await db.gitHubConnection.upsert({
            where: { userId: session.user.id },
            update: {
                accessToken: tokenData.access_token,
                githubId: githubUser.id,
                username: githubUser.login,
                avatarUrl: githubUser.avatar_url,
            },
            create: {
                userId: session.user.id,
                accessToken: tokenData.access_token,
                githubId: githubUser.id,
                username: githubUser.login,
                avatarUrl: githubUser.avatar_url,
            },
        });

        // Optionally still update user image if needed
        await db.user.update({
            where: { id: session.user.id },
            data: {
                image: githubUser.avatar_url || undefined, // Only update if github has one
            }
        });

        // Store token in session or database (simplified for demo)
        // In production, encrypt this token before storing

        return NextResponse.redirect(`${env.NEXTAUTH_URL}/dashboard/billing?github_connected=true`);
    } catch (error) {
        console.error("GitHub callback error:", error);
        return NextResponse.redirect(`${env.NEXTAUTH_URL}/dashboard/billing?github_error=failed`);
    }
}
