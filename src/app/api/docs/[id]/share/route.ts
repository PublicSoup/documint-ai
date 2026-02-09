import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveUserId } from "@/lib/resolve-user";

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = await resolveUserId(session);
        if (!userId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const { id: fileId } = await context.params;

        // Check if user owns the file or is in the team
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true }
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (file.userId !== userId) {
            // Also check team permissions if implemented, for now strictly owner
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { isPublic } = await req.json();

        if (!file.documentation) {
            return NextResponse.json({ error: "Documentation not generated yet" }, { status: 400 });
        }

        const updatedDoc = await db.documentation.update({
            where: { fileId },
            data: { isPublic: !!isPublic }
        });

        return NextResponse.json({
            success: true,
            isPublic: updatedDoc.isPublic,
            url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/share/${fileId}`
        });

    } catch (error) {
        console.error("Share error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
