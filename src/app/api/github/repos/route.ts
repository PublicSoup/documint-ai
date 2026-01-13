import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

// List user's GitHub repositories
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Fetch token from DB
        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id }
        });

        if (!connection || !connection.accessToken) {
            // Return demo repos if no token
            return NextResponse.json({
                repos: [
                    { id: 1, name: "my-project", full_name: "jdoe/my-project", language: "TypeScript", updated_at: new Date().toISOString(), private: false },
                    { id: 2, name: "api-server", full_name: "jdoe/api-server", language: "Python", updated_at: new Date().toISOString(), private: true },
                    { id: 3, name: "react-app", full_name: "jdoe/react-app", language: "JavaScript", updated_at: new Date().toISOString(), private: false },
                ],
                demo: true
            });
        }

        const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=20", {
            headers: {
                Authorization: `Bearer ${connection.accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        if (!res.ok) {
            // Handle token expiry or revocation (could optionally delete connection here)
            if (res.status === 401) {
                return NextResponse.json({ error: "GitHub token invalid" }, { status: 401 });
            }
            return NextResponse.json({ error: "Failed to fetch repos" }, { status: res.status });
        }

        const repos = await res.json();
        return NextResponse.json({
            repos: repos.map((repo: any) => ({
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
        console.error("GitHub repos error:", error);
        return NextResponse.json({ error: "Failed to fetch repositories" }, { status: 500 });
    }
}
