import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const paramsSchema = z.object({
    id: z.string().min(1),
}).strict();

// POST: rollback to a specific version
export async function POST(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await props.params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid version id" }, { status: 400 });
        }

        const { id: versionId } = parsedParams.data;

        const version = await db.docVersion.findUnique({
            where: { id: versionId },
            include: {
                documentation: {
                    include: { file: true },
                },
            },
        });

        if (!version) {
            return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }

        const canEdit = await checkFilePermission(session.user.id, version.documentation.fileId, "edit");
        if (!canEdit) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        await db.$transaction(async (tx) => {
            const latestVersion = await tx.docVersion.findFirst({
                where: { documentationId: version.documentationId },
                orderBy: { version: "desc" },
            });

            await tx.docVersion.create({
                data: {
                    documentationId: version.documentationId,
                    content: version.documentation.content,
                    version: (latestVersion?.version || 0) + 1,
                    message: `Auto-saved before rollback to v${version.version}`,
                    createdById: session.user.id,
                },
            });

            await tx.documentation.update({
                where: { id: version.documentationId },
                data: {
                    content: version.content,
                    status: "DRAFT",
                    verifiedAt: null,
                    verifiedById: null,
                },
            });
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: "ROLLBACK",
                entity: "Documentation",
                entityId: version.documentationId,
                userId: session.user.id,
                details: {
                    versionId,
                    versionNumber: version.version,
                    fileName: version.documentation.file.name,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            success: true,
            message: `Rolled back to version ${version.version}`,
            rolledBackVersion: version.version,
        });
    } catch (error) {
        console.error("Rollback error:", error);
        return NextResponse.json({ error: "Rollback failed" }, { status: 500 });
    }
}

// GET: fetch one version with permissions
export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await props.params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid version id" }, { status: 400 });
        }

        const { id } = parsedParams.data;

        const version = await db.docVersion.findUnique({
            where: { id },
            include: {
                documentation: {
                    include: { file: true },
                },
            },
        });

        if (!version) {
            return NextResponse.json({ error: "Version not found" }, { status: 404 });
        }

        const canView = await checkFilePermission(session.user.id, version.documentation.fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        return NextResponse.json({
            version,
            fileName: version.documentation.file.name,
        });
    } catch (error) {
        console.error("Version fetch error:", error);
        return NextResponse.json({ error: "Failed to fetch version" }, { status: 500 });
    }
}
