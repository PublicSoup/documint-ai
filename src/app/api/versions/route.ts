import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET: List versions for a documentation
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            return NextResponse.json({ error: "fileId required" }, { status: 400 });
        }

        // Verify access to file
        const file = await db.file.findFirst({
            where: { id: fileId, userId: session.user.id },
            include: { documentation: true }
        });

        if (!file || !file.documentation) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const versions = await db.docVersion.findMany({
            where: { documentationId: file.documentation.id },
            orderBy: { version: 'desc' },
            take: 20
        });

        return NextResponse.json({
            versions,
            currentVersion: versions[0]?.version || 1
        });

    } catch (error) {
        console.error("Version List Error:", error);
        return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
    }
}

// POST: Create a new version (snapshot current state)
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { fileId, message } = await req.json();

        if (!fileId) {
            return NextResponse.json({ error: "fileId required" }, { status: 400 });
        }

        // Get current documentation
        const file = await db.file.findFirst({
            where: { id: fileId, userId: session.user.id },
            include: { documentation: true }
        });

        if (!file || !file.documentation) {
            return NextResponse.json({ error: "Documentation not found" }, { status: 404 });
        }

        // Get latest version number
        const latestVersion = await db.docVersion.findFirst({
            where: { documentationId: file.documentation.id },
            orderBy: { version: 'desc' }
        });

        const newVersion = (latestVersion?.version || 0) + 1;

        // Create version snapshot
        const version = await db.docVersion.create({
            data: {
                documentationId: file.documentation.id,
                content: file.documentation.content,
                version: newVersion,
                message: message || `Version ${newVersion}`,
                createdById: session.user.id
            }
        });

        return NextResponse.json({
            version,
            message: `Created version ${newVersion}`
        });

    } catch (error) {
        console.error("Version Create Error:", error);
        return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
    }
}
