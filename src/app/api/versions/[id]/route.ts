import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// POST: Rollback to a specific version
export async function POST(
    req: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const versionId = params.id;

        // Get the version
        const version = await db.docVersion.findUnique({
            where: { id: versionId },
            include: {
                documentation: {
                    include: { file: true }
                }
            }
        });

        if (!version) {
            return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }

        // Verify access
        if (version.documentation.file.userId !== session.user.id) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Save current state as a new version before rollback
        const latestVersion = await db.docVersion.findFirst({
            where: { documentationId: version.documentationId },
            orderBy: { version: 'desc' }
        });

        await db.docVersion.create({
            data: {
                documentationId: version.documentationId,
                content: version.documentation.content,
                version: (latestVersion?.version || 0) + 1,
                message: `Auto-saved before rollback to v${version.version}`,
                createdById: session.user.id
            }
        });

        // Rollback: Update documentation with version content
        await db.documentation.update({
            where: { id: version.documentationId },
            data: {
                content: version.content,
                status: "DRAFT" // Reset to draft after rollback
            }
        });

        return NextResponse.json({
            success: true,
            message: `Rolled back to version ${version.version}`,
            rolledBackVersion: version.version
        });

    } catch (error) {
        console.error("Rollback Error:", error);
        return NextResponse.json({ error: "Rollback failed" }, { status: 500 });
    }
}

// GET: Get specific version content
export async function GET(
    req: Request,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const version = await db.docVersion.findUnique({
            where: { id: params.id },
            include: {
                documentation: {
                    include: { file: { select: { userId: true, name: true } } }
                }
            }
        });

        if (!version || version.documentation.file.userId !== session.user.id) {
            return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }

        return NextResponse.json({
            version,
            fileName: version.documentation.file.name
        });

    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch version" }, { status: 500 });
    }
}
