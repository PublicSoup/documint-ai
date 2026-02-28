import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendNotification } from "@/lib/notifications";
import { z } from "zod";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

/**
 * POST /api/docs/[id]/approve
 * Approve documentation and transition status to APPROVED.
 * Requires "approve" permission (Admin/Owner).
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Params
        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid file ID", parsedParams.error.flatten());
        }

        const { id: fileId } = parsedParams.data;

        // 3. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "approve");
        if (!hasPermission) {
            throw ApiErrors.forbidden("You do not have permission to approve documentation");
        }

        // 4. Fetch Documentation
        const doc = await db.documentation.findUnique({
            where: { fileId },
            include: { file: true }
        });

        if (!doc) {
            throw ApiErrors.notFound("Documentation");
        }

        // 5. Update documentation status in a transaction
        const updatedDoc = await db.$transaction(async (tx) => {
            // Update the main doc record
            const updated = await tx.documentation.update({
                where: { fileId },
                data: {
                    status: "APPROVED",
                    verifiedAt: new Date(),
                    verifiedById: session.user.id
                }
            });

            // Update any pending review requests for this doc by this user
            await tx.reviewRequest.updateMany({
                where: {
                    documentationId: doc.id,
                    reviewerId: session.user.id,
                    status: "PENDING"
                },
                data: {
                    status: "APPROVED"
                }
            });

            return updated;
        });

        // 6. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "APPROVE",
                entity: "Documentation",
                entityId: doc.id,
                details: { 
                    fileId,
                    fileName: doc.file.name,
                    previousStatus: doc.status
                }
            });
        } catch {
            // Keep mutation resilient if audit logging fails
        }

        // 7. Trigger Auto-GitHub Sync if configured
        if (doc.file.teamId) {
            try {
                const teamConfig = await db.integration.findFirst({
                    where: { teamId: doc.file.teamId, type: "TEAM_CONFIG" }
                });
                const config = (teamConfig?.config as { autoGithubSync?: boolean; githubRepo?: string } | null) || {};

                // 7.1. Slack/Discord Announcement for Approval
                await sendNotification({
                    userId: session.user.id,
                    type: "DOC_APPROVED",
                    title: "Documentation Approved ✅",
                    message: `The documentation for **${doc.file.name}** was reviewed and approved by **${session.user.name || "Admin"}**.`,
                    fileId,
                    fileName: doc.file.name,
                    teamId: doc.file.teamId || undefined
                });

                // 7.2. GitHub PR Export
                if (config.autoGithubSync && config.githubRepo) {
                    const host = req.headers.get("host");
                    if (host) {
                        const protocol = host.includes('localhost') ? 'http' : 'https';
                        // Fire-and-forget background sync
                        fetch(`${protocol}://${host}/api/github/pr`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Cookie": req.headers.get("cookie") || "",
                            },
                            body: JSON.stringify({
                                fileId,
                                repoFullName: config.githubRepo,
                            }),
                        }).catch(() => {
                            // Non-blocking background sync failure.
                        });
                    }
                }
            } catch {
                // Keep post-approval automation non-blocking.
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: "Documentation approved successfully",
            status: updatedDoc.status,
            verifiedAt: updatedDoc.verifiedAt
        });

    } catch (error) {
        return errorResponse(error);
    }
}
