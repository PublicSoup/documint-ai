import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await req.json();
        const { content } = body;

        if (!content) {
            return NextResponse.json({ message: "Content is required" }, { status: 400 });
        }

        // Check if file belongs to user
        const file = await db.file.findUnique({
            where: { id: id },
            select: { userId: true }
        });

        if (!file || file.userId !== session.user.id) {
            return NextResponse.json({ message: "File not found or access denied" }, { status: 404 });
        }

        // Update documentation
        const updatedDoc = await db.documentation.update({
            where: { fileId: id },
            data: {
                content: JSON.stringify(content)
            }
        });

        return NextResponse.json(updatedDoc);
    } catch (error) {
        console.error("Failed to update documentation", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}
