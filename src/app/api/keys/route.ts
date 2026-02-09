import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/keys - List user's API keys
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // For simplicity, we're not storing keys in DB yet
        // This would return stored keys (masked) from an ApiKey table
        return NextResponse.json({
            keys: [],
            message: "API keys feature - generate a key to get started"
        });

    } catch (error) {
        console.error("List keys error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

// POST /api/keys - Generate new API key
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const body = await req.json().catch(() => ({}));
        const keyName = body.name || "Default Key";

        // Generate a unique API key
        const randomPart = crypto.randomUUID().replace(/-/g, "");
        const apiKey = `dk_${user.id}_${randomPart}`;

        // In production, you would:
        // 1. Hash the key for storage
        // 2. Store in an ApiKey table with metadata
        // 3. Only return the full key once (this time)

        return NextResponse.json({
            key: apiKey,
            name: keyName,
            createdAt: new Date().toISOString(),
            warning: "Save this key securely. It won't be shown again."
        });

    } catch (error) {
        console.error("Generate key error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
