import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { uploadFile } from "@/lib/supabase/storage";
import { getUserSubscription } from "@/lib/subscription";

// Get raw file content
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
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
