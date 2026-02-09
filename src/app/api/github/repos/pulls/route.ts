import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const owner = searchParams.get("owner");
        const repo = searchParams.get("repo");

        if (!owner || !repo) {
            return NextResponse.json({ error: "Owner and Repo are required" }, { status: 400 });
        }

        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id }
        });

        if (!connection?.accessToken) {
            return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
        }

        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            headers: {
                "Authorization": `Bearer ${connection.accessToken}`,
                "Accept": "application/vnd.github.v3+json",
            }
        });

        if (!res.ok) {
            const err = await res.json();
            return NextResponse.json({ error: err.message || "Failed to fetch PRs" }, { status: res.status });
        }

        const pulls = await res.json();
        return NextResponse.json({ pulls });

    } catch (error) {
        console.error("Fetch PRs error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
