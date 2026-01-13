import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: fileId } = await params;

        // Fetch file with team info
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: {
                team: {
                    include: {
                        members: true
                    }
                }
            }
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Get current user's ID
        const user = await db.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const userId = user.id;
        let canDelete = false;

        if (file.teamId) {
            // Team File RBAC
            const membership = file.team?.members.find(m => m.userId === userId);

            if (!membership) {
                // Not a member of the team
                return NextResponse.json({ error: "Access denied" }, { status: 403 });
            }

            if (membership.role === "OWNER" || membership.role === "ADMIN") {
                // Admin/Owner can delete any file
                canDelete = true;
            } else if (file.userId === userId) {
                // Regular members can only delete their own files
                canDelete = true;
            }
        } else {
            // Personal File RBAC
            if (file.userId === userId) {
                canDelete = true;
            }
        }

        if (!canDelete) {
            return NextResponse.json(
                { error: "You do not have permission to delete this file" },
                { status: 403 }
            );
        }

        // Perform deletion
        await db.file.delete({
            where: { id: fileId }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Delete file error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
