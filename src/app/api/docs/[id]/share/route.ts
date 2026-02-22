import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

const shareBodySchema = z.object({
    isPublic: z.boolean(),
}).strict();

/**
 * POST /api/docs/[id]/share
 * Updates the public sharing status of a document.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Params and Body
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid file ID"));
        }
        const { id: fileId } = parsedParams.data;

        const { isPublic } = await validateBody(req, shareBodySchema);

        // 3. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "manage");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to manage sharing for this document."));
        }

        // 4. Fetch file and documentation
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        if (!file) {
            return errorResponse(ApiErrors.notFound("File"));
        }

        if (!file.documentation) {
            return errorResponse(ApiErrors.badRequest("Documentation not generated yet."));
        }

        // 5. Enforce Team Policy: Require approval for public sharing
        if (isPublic && file.teamId) {
            const teamConfigRecord = await db.integration.findFirst({
                where: { teamId: file.teamId, type: "TEAM_CONFIG" },
                select: { config: true },
            });
            const config = (teamConfigRecord?.config && typeof teamConfigRecord.config === "object" ? teamConfigRecord.config : {}) as { requireApproval?: boolean };

            if (config.requireApproval && file.documentation.status !== "APPROVED") {
                return errorResponse(ApiErrors.forbidden("Team policy requires APPROVED documentation before public sharing."));
            }
        }

        // 6. Update document
        const updatedDoc = await db.documentation.update({
            where: { fileId },
            data: { isPublic },
        });

        // 7. Audit Log
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

        const appUrl = env.NEXT_PUBLIC_APP_URL || "";

        return NextResponse.json({
            success: true,
            isPublic: updatedDoc.isPublic,
            url: `${appUrl}/share/${fileId}`,
        });
    } catch (error) {
        return errorResponse(error);
    }
}
