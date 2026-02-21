import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";

const paramsSchema = z.object({
    id: z.string().min(1),
}).strict();

const shareBodySchema = z.object({
    isPublic: z.boolean(),
}).strict();

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = paramsSchema.safeParse(await context.params);
        if (!parsedParams.success) {
            return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
        }

        const parsedBody = shareBodySchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { id: fileId } = parsedParams.data;
        const { isPublic } = parsedBody.data;

        const hasPermission = await checkFilePermission(session.user.id, fileId, "manage");
        if (!hasPermission) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (!file.documentation) {
            return NextResponse.json({ error: "Documentation not generated yet" }, { status: 400 });
        }

        if (isPublic && file.teamId) {
            const teamConfig = await db.integration.findFirst({
                where: { teamId: file.teamId, type: "TEAM_CONFIG" },
                select: { config: true },
            });
            const config = (teamConfig?.config as { requireApproval?: boolean } | null) || {};

            if (config.requireApproval && file.documentation.status !== "APPROVED") {
                return NextResponse.json(
                    {
                        error: "Policy Violation",
                        message: "Team policy requires APPROVED documentation before public sharing.",
                    },
                    { status: 403 }
                );
            }
        }

        const updatedDoc = await db.documentation.update({
            where: { fileId },
            data: { isPublic },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: isPublic ? "SHARE_PUBLIC" : "REVOKE_PUBLIC",
                entity: "Documentation",
                entityId: file.documentation.id,
                details: {
                    fileId,
                    fileName: file.name,
                    isPublic,
                },
            });
        } catch {
            // Non-blocking
        }

        const baseUrl = env.NEXT_PUBLIC_APP_URL || "";

        return NextResponse.json({
            success: true,
            isPublic: updatedDoc.isPublic,
            url: `${baseUrl}/share/${fileId}`,
        });
    } catch (error) {
        console.error("Share error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
