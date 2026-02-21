import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

// Disconnect GitHub account
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await db.gitHubConnection.delete({
            where: { userId: session.user.id }
        });

        return NextResponse.json({ success: true, message: "GitHub disconnected" });
    } catch (error) {
        console.error("GitHub disconnect error:", error);
        return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
    }
}
