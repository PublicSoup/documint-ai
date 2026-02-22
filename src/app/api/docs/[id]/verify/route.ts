import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkFilePermission } from "@/lib/permissions";
import { z } from "zod";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

/**
 * POST /api/docs/[id]/verify
 * Toggle documentation verification status.
 * Requires "approve" permission (Admin/Owner).
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

        // 2. Validate Params
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid file ID"));
        }
        const { id: fileId } = parsedParams.data;

        // 3. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "approve");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to verify documentation"));
        }

        // 4. Fetch Documentation
        const doc = await db.documentation.findUnique({
            where: { fileId },
            include: { file: true }
        });

        if (!doc) {
            return errorResponse(ApiErrors.notFound("Documentation"));
        }

        // 5. Toggle verification
        const isVerified = !!doc.verifiedAt;

        // If already verified, unverify. If not, verify.
        const updatedDoc = await db.documentation.update({
            where: { fileId },
            data: {
                verifiedAt: isVerified ? null : new Date(),
                verifiedById: isVerified ? null : session.user.id,
                // Automatically transition status to APPROVED if verifying, or DRAFT if unverifying
                status: isVerified ? "DRAFT" : "APPROVED"
            }
        });

        // 6. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: isVerified ? "UNVERIFY" : "VERIFY",
                entity: "Documentation",
                entityId: doc.id,
                userId: session.user.id,
                details: {
                    fileId,
                    fileName: doc.file.name,
                    previousStatus: doc.status,
                    newStatus: updatedDoc.status
                }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            success: true,
            verified: !isVerified,
            verifiedAt: updatedDoc.verifiedAt,
            verifiedById: updatedDoc.verifiedById,
            status: updatedDoc.status
        });

    } catch (error) {
        return errorResponse(error);
    }
}
