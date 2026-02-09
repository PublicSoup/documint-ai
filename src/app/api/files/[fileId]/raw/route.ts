import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { uploadFile } from "@/lib/supabase/storage";
import { getUserSubscription } from "@/lib/subscription";
import { getLocalFile, updateLocalFile, deleteLocalFile, isLocalFileId } from "@/lib/local-dev-storage";

// Get raw file content
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // DEV MODE BYPASS: Use local storage for local file IDs
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            console.log("📖 [Dev Mode] Reading local file:", fileId);
            const file = await getLocalFile(fileId);
            if (!file) {
                return NextResponse.json({ error: "File not found" }, { status: 404 });
            }
            return NextResponse.json({ content: file.content });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Check Access & Subscription
        if (file.userId !== session.user.id) {
            const teamMember = await db.teamMember.findFirst({
                where: { userId: session.user.id, teamId: file.teamId || "" }
            });
            if ((file.teamId && !teamMember) || (!file.teamId && file.userId !== session.user.id)) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
            }
        }

        // Enforce Paid Plan for Code View (IDE Experience)
        const subscription = await getUserSubscription(session.user.id);
        if (!subscription || !subscription.isActive) { // Simple check: Must be a paid subscriber
            return NextResponse.json({ error: "Upgrade to Pro to view source code" }, { status: 402 });
        }

        const content = await getFileContent(file.id);
        return NextResponse.json({ content });

    } catch (error) {
        console.error("Raw content error:", error);
        return NextResponse.json({ error: "Failed to fetch content" }, { status: 500 });
    }
}

// Update raw file content
export async function PUT(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { content } = await req.json();

        // DEV MODE BYPASS: Use local storage for local file IDs
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            console.log("💾 [Dev Mode] Saving local file:", fileId);
            const success = await updateLocalFile(fileId, content);
            if (!success) {
                return NextResponse.json({ error: "File not found" }, { status: 404 });
            }
            return NextResponse.json({ success: true });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (file.userId !== session.user.id) {
            // Basic auth check, should match GET logic theoretically but strict owner for write for now
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Upload to storage (overwrites)
        if (file.storagePath) {
            await uploadFile(file.storagePath, content);
        }

        // Update DB
        await db.file.update({
            where: { id: fileId },
            data: {
                size: content.length,
                updatedAt: new Date(),
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Save raw content error:", error);
        return NextResponse.json({ error: "Failed to save content" }, { status: 500 });
    }
}

// Rename file (or move if path changes)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name } = await req.json();

        if (!name) {
            return NextResponse.json({ error: "New name is required" }, { status: 400 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (file.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Update DB
        await db.file.update({
            where: { id: fileId },
            data: {
                name,
                updatedAt: new Date(),
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Rename file error:", error);
        return NextResponse.json({ error: "Failed to rename file" }, { status: 500 });
    }
}

// Delete file
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
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

        const userId = session.user.id;
        let canDelete = false;

        if (file.teamId) {
            // Team File RBAC
            const membership = file.team?.members.find(m => m.userId === userId);

            if (!membership) {
                return NextResponse.json({ error: "Access denied" }, { status: 403 });
            }

            if (membership.role === "OWNER" || membership.role === "ADMIN") {
                canDelete = true;
            } else if (file.userId === userId) {
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

        await db.file.delete({
            where: { id: fileId }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Delete file error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
