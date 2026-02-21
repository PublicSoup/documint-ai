import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sendEmail, emailTemplates } from "@/lib/email";
import { sendNotification } from "@/lib/notifications";

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        // Enforce rate limit (300 requests per minute by default for API tier)
        await enforceRateLimit(session.user.id, "api");

        const body = await req.json();
        const { content } = body;

        if (!content) {
            return NextResponse.json({ message: "Content is required" }, { status: 400 });
        }

        // Check if user has permission to edit the file (which owns the documentation)
        const hasPermission = await checkFilePermission(session.user.id, id, "edit");

        if (!hasPermission) {
            return NextResponse.json({ message: "Access denied" }, { status: 403 });
        }

        // Find the current documentation record and original file
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
                                    select: { email: true, name: true }
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
            return NextResponse.json({ message: "Documentation not found" }, { status: 404 });
        }

        // 0. Optimistic Locking Check
        const currentVersion = doc.versions[0]?.version || 0;
        const baseVersion = body.baseVersion;
        
        if (baseVersion !== undefined && baseVersion !== currentVersion) {
            return NextResponse.json({ 
                error: "Conflict", 
                message: "This documentation was updated by someone else while you were editing. Please refresh and try again.",
                currentVersion,
                baseVersion 
            }, { status: 409 });
        }

        // 0.1 Check Team Policy: Lock Approved Docs
        if (file?.teamId && file.team) {
            const config = (file.team.integrations[0]?.config as { lockApproved?: boolean } | null) || {};
            
            if (config.lockApproved && doc.status === "APPROVED") {
                // We already have members filtered to OWNER/ADMIN in the include, 
                // but that's for notification. We need to check the CURRENT user.
                const userMembership = await db.teamMember.findUnique({
                    where: { teamId_userId: { teamId: file.teamId, userId: session.user.id } }
                });
                const isManagement = userMembership?.role === "OWNER" || userMembership?.role === "ADMIN";
                
                if (!isManagement) {
                    return NextResponse.json({ 
                        error: "Locked", 
                        message: "This documentation is APPROVED and locked by team policy. Only administrators can modify it." 
                    }, { status: 423 });
                }
            }
        }

        const nextVersion = (doc.versions[0]?.version || 0) + 1;
        
        // Automatic Status Transition Logic
        let newStatus = doc.status;
        let verifiedAt = doc.verifiedAt;
        let verifiedById = doc.verifiedById;

        // Fetch team policy
        const teamConfig = (file?.team?.integrations[0]?.config as { requireApproval?: boolean } | null) || {};
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
        if (body.status === "REVIEW" && newStatus === "DRAFT") {
            newStatus = "REVIEW";
        }

        // 4. Determine if we should trigger notification (only on first transition to REVIEW)
        const transitioningToReview = newStatus === "REVIEW" && doc.status !== "REVIEW";

        // Update documentation and create version in a transaction
        const updatedDoc = await db.$transaction(async (tx) => {
            const updated = await tx.documentation.update({
                where: { fileId: id },
                data: {
                    content: JSON.stringify(content),
                    status: newStatus,
                    verifiedAt,
                    verifiedById
                }
            });

            await tx.docVersion.create({
                data: {
                    documentationId: doc.id,
                    content: JSON.stringify(content),
                    version: nextVersion,
                    createdById: session.user.id,
                    message: body.message || `Updated via editor (v${nextVersion})`
                }
            });

            return updated;
        });

        // 3. Trigger Review Notifications and create Review Request
        if (transitioningToReview && file) {
            const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?docId=${id}`;
            const requesterName = session.user.name || session.user.email || "A developer";

            // 3.0. Create review request record with deterministic reviewer assignment
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

            // 3.1. Email Notifications
            if (file.teamId && file.team) {
                // If we assigned a specific reviewer, notify them. Otherwise notify all admins.
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

            // 3.2. Webhook Notifications (Slack/Discord)
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
            } catch {
                console.error("Failed to trigger webhook notification");
            }
        }

        // Log the action for audit trail
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
        console.error("Failed to update documentation", error);
        return NextResponse.json({ message: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        // 1. Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Check permissions (Documentation deletion usually requires same as file deletion or higher)
        const hasPermission = await checkFilePermission(session.user.id, id, "delete");
        if (!hasPermission) {
            return NextResponse.json({ message: "Access denied: You do not have permission to delete this documentation" }, { status: 403 });
        }

        // 3. Fetch doc info for logging
        const doc = await db.documentation.findUnique({
            where: { fileId: id },
            include: { file: true }
        });

        if (!doc) {
            return NextResponse.json({ message: "Documentation not found" }, { status: 404 });
        }

        // 4. Perform Deletion
        await db.documentation.delete({
            where: { fileId: id }
        });

        // 5. Audit Log (High Integrity)
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
        console.error("[DeleteDoc_API] Error:", error);
        return NextResponse.json({ error: "Failed to delete documentation" }, { status: 500 });
    }
}
