import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";

const getVersionsQuerySchema = z.object({
    fileId: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const createVersionSchema = z.object({
    fileId: z.string().min(1),
    message: z.string().trim().max(500).optional(),
}).strict();

// GET: list versions for a documentation file
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = getVersionsQuerySchema.safeParse({
            fileId: new URL(req.url).searchParams.get("fileId") ?? "",
            limit: new URL(req.url).searchParams.get("limit") ?? 20,
        });

        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid query" }, { status: 400 });
        }

        const { fileId, limit } = parsed.data;

        const canView = await checkFilePermission(session.user.id, fileId, "view");
        if (!canView) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file?.documentation) {
            return NextResponse.json({ error: "Documentation not found" }, { status: 404 });
        }

        const versions = await db.docVersion.findMany({
            where: { documentationId: file.documentation.id },
            orderBy: { version: "desc" },
            take: limit,
        });

        return NextResponse.json({
            versions,
            currentVersion: versions[0]?.version || 1,
        });
    } catch (error) {
        console.error("Version list error:", error);
        return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
    }
}

// POST: create a new manual version snapshot
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsed = createVersionSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { fileId, message } = parsed.data;

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file?.documentation) {
            return NextResponse.json({ error: "Documentation not found" }, { status: 404 });
        }

        const version = await db.$transaction(async (tx) => {
            const latestVersion = await tx.docVersion.findFirst({
                where: { documentationId: file.documentation!.id },
                orderBy: { version: "desc" },
            });

            const nextVersion = (latestVersion?.version || 0) + 1;

            return tx.docVersion.create({
                data: {
                    documentationId: file.documentation!.id,
                    content: file.documentation!.content,
                    version: nextVersion,
                    message: message || `Version ${nextVersion}`,
                    createdById: session.user.id,
                },
            });
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: "SNAPSHOT",
                entity: "Documentation",
                entityId: file.documentation.id,
                userId: session.user.id,
                details: {
                    fileId,
                    fileName: file.name,
                    version: version.version,
                    manual: true,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            version,
            message: `Created version ${version.version}`,
        });
    } catch (error) {
        console.error("Version create error:", error);
        return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
    }
}
