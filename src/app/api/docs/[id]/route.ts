import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendNotification } from "@/lib/notifications";
import { errorResponse, validateBody, validateQuery, ApiErrors } from "@/lib/api-utils";

const updateDocSchema = z.object({
    content: z.string().min(1),
    baseVersion: z.number().int().min(0).optional(),
    status: z.enum(["DRAFT", "REVIEW", "APPROVED"]).optional(),
    message: z.string().trim().max(500).optional(),
}).strict();

const paramsSchema = z.object({
    id: z.string().min(1),
}).strict();

/**
 * GET /api/docs/[id]
 * Fetch documentation for a specific file.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid file ID"));
        }
        const { id: fileId } = parsedParams.data;

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, fileId, "view");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden());
        }

        // 3. Fetch Documentation
        const doc = await db.documentation.findUnique({
            where: { fileId },
            include: {
                file: {
                    select: { name: true, language: true }
                },
                versions: {
                    orderBy: { version: 'desc' },
                    take: 1
                }
            }
        });

        if (!doc) {
            return errorResponse(ApiErrors.notFound("Documentation"));
        }

        return NextResponse.json({ doc });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * PUT /api/docs/[id]
 * Update documentation content and manage status transitions.
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid file ID"));
        }
        const { id } = parsedParams.data;

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Body
        const { content, baseVersion, status: bodyStatus, message } = await validateBody(req, updateDocSchema);

        // 3. Check if user has permission to edit the file
        const hasPermission = await checkFilePermission(session.user.id, id, "edit");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to edit this documentation"));
        }

        // 4. Find the current documentation record and original file
        const file = await db.file.findUnique({
            where: { id: id },
            include: {
                team: {
                    include: {
                        members: {
                            where: {
                                role: { in: ["OWNER", "ADMIN"] }
                            },
                            include: {
                                user: {
                                    select: { email: true, name: true, id: true }
                                }
                            }
                        },
                        integrations: {
                            where: { type: "TEAM_CONFIG" },
                            take: 1
                        }
                    }
                }
            }
        });

        const doc = await db.documentation.findUnique({
            where: { fileId: id },
            include: { 
                versions: {
                    orderBy: { version: 'desc' },
                    take: 1
                }
            }
        });

        if (!doc) {
            return errorResponse(ApiErrors.notFound("Documentation"));
        }

        // 5. Optimistic Locking Check
        const currentVersion = doc.versions[0]?.version || 0;
        
        if (baseVersion !== undefined && baseVersion !== currentVersion) {
            return NextResponse.json({ 
                error: "Conflict", 
                message: "This documentation was updated by someone else while you were editing. Please refresh and try again.",
                currentVersion,
                baseVersion 
            }, { status: 409 });
        }

        // 6. Check Team Policy: Lock Approved Docs
        if (file?.teamId && file.team) {
            const teamConfigRaw = file.team.integrations[0]?.config;
            const config = (teamConfigRaw && typeof teamConfigRaw === "object" ? teamConfigRaw : {}) as { lockApproved?: boolean };
            
            if (config.lockApproved && doc.status === "APPROVED") {
                const userMembership = await db.teamMember.findUnique({
                    where: { teamId_userId: { teamId: file.teamId, userId: session.user.id } }
                });
                const isManagement = userMembership?.role === "OWNER" || userMembership?.role === "ADMIN";
                
                if (!isManagement) {
                    return errorResponse(ApiErrors.forbidden("This documentation is APPROVED and locked by team policy. Only administrators can modify it."));
                }
            }
        }

        const nextVersion = (doc.versions[0]?.version || 0) + 1;
        
        // Automatic Status Transition Logic
        let newStatus = doc.status;
        let verifiedAt = doc.verifiedAt;
        let verifiedById = doc.verifiedById;

        // Fetch team policy
        const teamConfigRaw = file?.team?.integrations[0]?.config;
        const teamConfig = (teamConfigRaw && typeof teamConfigRaw === "object" ? teamConfigRaw : {}) as { requireApproval?: boolean };
        const isMandatoryReview = teamConfig.requireApproval === true;

        // 1. Demote if already approved (content change requires re-verification)
        if (doc.status === "APPROVED") {
            newStatus = isMandatoryReview ? "REVIEW" : "DRAFT";
            verifiedAt = null;
            verifiedById = null;
        }

        // 2. Enforce Mandatory Review policy (docs go straight to REVIEW on save if DRAFT)
        if (isMandatoryReview && newStatus === "DRAFT") {
            newStatus = "REVIEW";
        }

        // 3. Handle explicit transition request to REVIEW
        if (bodyStatus === "REVIEW" && newStatus === "DRAFT") {
            newStatus = "REVIEW";
        }

        // 4. Determine if we should trigger notification (only on first transition to REVIEW)
        const transitioningToReview = newStatus === "REVIEW" && doc.status !== "REVIEW";

        // Update documentation and create version in a transaction
        const updatedDoc = await db.$transaction(async (tx) => {
            const updated = await tx.documentation.update({
                where: { fileId: id },
                data: {
                    content: content, // Already JSON string or plain text depending on frontend
                    status: newStatus,
                    verifiedAt,
                    verifiedById
                }
            });

            await tx.docVersion.create({
                data: {
                    documentationId: doc.id,
                    content: content,
                    version: nextVersion,
                    createdById: session.user.id,
                    message: message || `Updated via editor (v${nextVersion})`
                }
            });

            return updated;
        });

        // 7. Trigger Review Notifications and create Review Request
        if (transitioningToReview && file) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const reviewUrl = `${appUrl}/dashboard?docId=${id}`;
            const requesterName = session.user.name || session.user.email || "A developer";

            // Create review request record with deterministic reviewer assignment
            let assignedReviewerId: string | null = null;
            if (file.teamId && file.team) {
                const potentialReviewers = file.team.members.filter(m => m.userId !== session.user.id);
                if (potentialReviewers.length > 0) {
                    const loads = await Promise.all(
                        potentialReviewers.map(async (m) => ({
                            userId: m.userId,
                            pending: await db.reviewRequest.count({
                                where: {
                                    reviewerId: m.userId,
                                    status: "PENDING",
                                },
                            }),
                        }))
                    );
                    loads.sort((a, b) => a.pending - b.pending);
                    assignedReviewerId = loads[0].userId;
                }
            }

            await db.reviewRequest.create({
                data: {
                    documentationId: doc.id,
                    requesterId: session.user.id,
                    reviewerId: assignedReviewerId,
                    status: "PENDING"
                }
            });

            // Email Notifications
            if (file.teamId && file.team) {
                const targetMembers = assignedReviewerId 
                    ? file.team.members.filter(m => m.userId === assignedReviewerId)
                    : file.team.members.filter(m => m.userId !== session.user.id);

                const emailPromises = targetMembers
                    .filter(m => m.user.email)
                    .map(m => sendEmail({
                        to: m.user.email!,
                        subject: `Review Requested: ${file.name}`,
                        html: emailTemplates.reviewRequested(
                            m.user.name || "Reviewer",
                            requesterName,
                            file.name,
                            reviewUrl
                        )
                    }));
                await Promise.allSettled(emailPromises);
            }

            // Webhook Notifications (Slack/Discord)
            try {
                await sendNotification({
                    userId: session.user.id,
                    type: "REVIEW_REQUESTED",
                    title: "Documentation Review Requested",
                    message: `**${requesterName}** requested a review for **${file.name}**.`,
                    fileId: id,
                    fileName: file.name,
                    teamId: file.teamId || undefined
                });
            } catch (e) {
                console.error("Failed to trigger webhook notification", e);
            }
        }

        // 8. Log the action for audit trail
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: "UPDATE",
                entity: "Documentation",
                entityId: doc.id,
                userId: session.user.id,
                details: {
                    fileId: id,
                    fileName: file?.name,
                    version: nextVersion,
                    status: newStatus
                }
            });
        } catch (auditError) {
            console.error("Failed to log audit for doc update:", auditError);
        }

        return NextResponse.json(updatedDoc);
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * DELETE /api/docs/[id]
 * Delete documentation for a file.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid file ID"));
        }
        const { id } = parsedParams.data;

        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Check permissions
        const hasPermission = await checkFilePermission(session.user.id, id, "delete");
        if (!hasPermission) {
            return errorResponse(ApiErrors.forbidden("You do not have permission to delete this documentation"));
        }

        // 3. Fetch doc info for logging
        const doc = await db.documentation.findUnique({
            where: { fileId: id },
            include: { file: true }
        });

        if (!doc) {
            return errorResponse(ApiErrors.notFound("Documentation"));
        }

        // 4. Perform Deletion
        await db.documentation.delete({
            where: { fileId: id }
        });

        // 5. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "DELETE",
                entity: "Documentation",
                entityId: doc.id,
                details: { 
                    fileId: id,
                    fileName: doc.file.name
                }
            });
        } catch {
            // Ignore audit logging errors
        }

        return NextResponse.json({ success: true, message: "Documentation deleted successfully" });
    } catch (error) {
        return errorResponse(error);
    }
}
