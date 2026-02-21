import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

// Create a new GitHub repository
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name, description, isPrivate, autoInit } = await req.json();

        if (!name) {
            return NextResponse.json({ error: "Repository name is required" }, { status: 400 });
        }

        // Fetch token from DB
        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id }
        });

        if (!connection || !connection.accessToken) {
            return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
        }

        // Create the repository via GitHub API
        const gitRes = await fetch("https://api.github.com/user/repos", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${connection.accessToken}`,
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
            const errorData = await gitRes.json();
            return NextResponse.json({
                error: errorData.message || "Failed to create repository on GitHub"
            }, { status: gitRes.status });
        }

        const repoData = await gitRes.json();

        // Audit Logging
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
        } catch (e) {}

        return NextResponse.json({
            message: "Repository created successfully",
            repo: {
                id: repoData.id,
                name: repoData.name,
                full_name: repoData.full_name,
                html_url: repoData.html_url,
                private: repoData.private,
            }
        });
    } catch (error) {
        console.error("Create repo error:", error);
        return NextResponse.json({ error: "Failed to create repository" }, { status: 500 });
    }
}
