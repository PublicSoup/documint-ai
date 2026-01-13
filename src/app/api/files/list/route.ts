import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveUserId } from "@/lib/resolve-user";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const userId = await resolveUserId(session);

        if (!userId) {
            return NextResponse.json({ message: "User not found" }, { status: 404 });
        }

        const files = await db.file.findMany({
            where: {
                userId: userId,
            },
            select: {
                id: true,
                name: true,
                language: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json({ files });
    } catch (error) {
        console.error("List files error:", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
