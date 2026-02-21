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
            return NextResponse.json({
                repos: [],
                connected: false,
            });
        }

        const { searchParams } = new URL(req.url);
        const page = searchParams.get("page") || "1";
        const perPage = searchParams.get("per_page") || "20";

        const res = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}`, {
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
        console.error("GitHub repos error:", error);
        return NextResponse.json({ error: "Failed to fetch repositories" }, { status: 500 });
    }
}
