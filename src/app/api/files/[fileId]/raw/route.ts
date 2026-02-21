import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { uploadFile } from "@/lib/supabase/storage";
import { getUserSubscription } from "@/lib/subscription";
import { getLocalFile, updateLocalFile, isLocalFileId } from "@/lib/local-dev-storage";
import { detectIntentDrift } from "@/lib/ai";
import { sendNotification } from "@/lib/notifications";
import { checkFilePermission } from "@/lib/permissions";

// Get raw file content
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // DEV MODE BYPASS: Use local storage for local file IDs
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            console.log("📖 [Dev Mode] Reading local file:", fileId);
            const file = await getLocalFile(fileId);
            if (!file) {
                return NextResponse.json({ error: "File not found" }, { status: 404 });
            }
            return NextResponse.json({ content: file.content });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        // Check Access & Subscription
        if (file.userId !== session.user.id) {
            const teamMember = await db.teamMember.findFirst({
                where: { userId: session.user.id, teamId: file.teamId || "" }
            });
            if ((file.teamId && !teamMember) || (!file.teamId && file.userId !== session.user.id)) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
            }
        }

        // Enforce Paid Plan for Code View (IDE Experience)
        const subscription = await getUserSubscription(session.user.id);
        if (!subscription || !subscription.isActive) { // Simple check: Must be a paid subscriber
            return NextResponse.json({ error: "Upgrade to Pro to view source code" }, { status: 402 });
        }

        const content = await getFileContent(file.id);

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "VIEW_CODE",
                entity: "File",
                entityId: fileId,
                details: { name: file.name }
            });
        } catch {
            // Ignore audit logging errors
        }

        return NextResponse.json({ content });

    } catch (error) {
        console.error("Raw content error:", error);
        return NextResponse.json({ error: "Failed to fetch content" }, { status: 500 });
    }
}

// Update raw file content
export async function PUT(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { content } = await req.json();

        // DEV MODE BYPASS: Use local storage for local file IDs
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            console.log("💾 [Dev Mode] Saving local file:", fileId);
            const success = await updateLocalFile(fileId, content);
            if (!success) {
                return NextResponse.json({ error: "File not found" }, { status: 404 });
            }
            return NextResponse.json({ success: true });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Upload to storage (overwrites)
        if (file.storagePath) {
            await uploadFile(file.storagePath, content);
        }

        // Update DB
        const updatedFile = await db.file.update({
            where: { id: fileId },
            data: {
                size: content.length,
                updatedAt: new Date(),
            },
            include: {
                documentation: true
            }
        });

        let intentDrift = null;

        // Drift Detection: Check if documentation exists and mark status
        if (updatedFile.documentation) {
            await db.documentation.update({
                where: { id: updatedFile.documentation.id },
                data: { status: "DRAFT" } // Reset to DRAFT when code changes (Drift)
            });

            // AI Intent Shadowing: Detect significant mismatch
            try {
                const intentResult = await detectIntentDrift(content, updatedFile.documentation.content);
                if (intentResult.drifted) {
                    intentDrift = intentResult;

                    // 1. Force REVIEW status and create Review Request
                    try {
                        await db.reviewRequest.create({
                            data: {
                                documentationId: updatedFile.documentation.id,
                                requesterId: session.user.id,
                                status: "PENDING",
                                comments: `AI Shadowing detected intent drift: ${intentResult.reasoning}`
                            }
                        });

                        await db.documentation.update({
                            where: { id: updatedFile.documentation.id },
                            data: { status: "REVIEW" }
                        });
                    } catch (reqError) {
                        console.error("Failed to create review request for intent drift:", reqError);
                    }

                    // 2. Audit Log
                    const { logAudit } = await import("@/lib/audit-logger");
                    await logAudit({
                        userId: session.user.id,
                        action: "INTENT_DRIFT_DETECTED",
                        entity: "Documentation",
                        entityId: updatedFile.documentation.id,
                        details: { 
                            reasoning: intentResult.reasoning,
                            fileName: updatedFile.name
                        }
                    });

                    // 3. Notify Team
                    await sendNotification({
                        userId: session.user.id,
                        teamId: updatedFile.teamId || undefined,
                        type: "INTENT_DRIFT",
                        title: "Critical Documentation Mismatch 🚩",
                        message: `AI Shadowing detected that the latest changes to **${updatedFile.name}** conflict with the documented intent.\n\n**Reasoning:** ${intentResult.reasoning}`,
                        fileId: fileId,
                        fileName: updatedFile.name
                    });
                }
            } catch (e) {
                console.error("Shadowing failed:", e);
            }
        }

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "UPDATE_FILE",
                entity: "File",
                entityId: fileId,
                details: { 
                    name: updatedFile.name, 
                    size: content.length,
                    hadDrift: !!updatedFile.documentation
                }
            });
        } catch {
            // Ignore audit logging errors
        }

        // Notify via Webhooks and Email if configured
        try {
            const user = await db.user.findUnique({
                where: { id: session.user.id },
                select: { email: true, name: true, settings: true }
            });
            const settings = (user?.settings ?? {}) as {
                autoRegenerate?: boolean;
                notifyOnDocChange?: boolean;
            };

            // Smart Auto-Regeneration
            if (settings.autoRegenerate && updatedFile.documentation) {
                const oldContent = file.content || "";
                const newContent = content;
                const diffLen = Math.abs(newContent.length - oldContent.length);

                // Significant update: > 100 chars or > 20% change
                if (diffLen > 100 || (oldContent.length > 0 && diffLen / oldContent.length > 0.2)) {
                    const host = req.headers.get("host");
                    if (host) {
                        const protocol = host.includes('localhost') ? 'http' : 'https';
                        fetch(`${protocol}://${host}/api/regenerate/${fileId}`, {
                            method: "POST",
                            headers: { "Cookie": req.headers.get("cookie") || "" },
                            body: JSON.stringify({ draft: true }) // Proactively draft resolution
                        }).catch(e => console.error("Auto-regen trigger failed:", e));
                    }
                }
            } else if (updatedFile.documentation) {
                // If auto-regen is OFF, we still want to draft a suggestion for the user to review
                const host = req.headers.get("host");
                if (host) {
                    const protocol = host.includes('localhost') ? 'http' : 'https';
                    fetch(`${protocol}://${host}/api/regenerate/${fileId}`, {
                        method: "POST",
                        headers: { "Cookie": req.headers.get("cookie") || "" },
                        body: JSON.stringify({ draft: true })
                    }).catch(() => {});
                }
            }

            if (settings.notifyOnDocChange) {
                // 1. Webhook Notifications
                await sendNotification({
                    userId: session.user.id,
                    teamId: updatedFile.teamId || undefined,
                    type: "DOC_DRIFT",
                    title: "Documentation Drift Detected",
                    message: `The file **${updatedFile.name}** was updated. Associated documentation is now marked as DRAFT and may be out of sync.`,
                    fileId: fileId,
                    fileName: updatedFile.name
                });

                // 2. Email Notifications (Non-blocking)
                if (user?.email && updatedFile.documentation) {
                    (async () => {
                        try {
                            const { sendEmail, emailTemplates } = await import("@/lib/email");
                            const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard?docId=${fileId}`;
                            
                            await sendEmail({
                                to: user!.email!,
                                subject: `Documentation Drift: ${updatedFile.name}`,
                                html: emailTemplates.documentationDrift(
                                    user!.name || "Developer",
                                    updatedFile.name,
                                    dashboardUrl
                                )
                            });
                        } catch (emailErr) {
                            console.error("Drift email notification failed:", emailErr);
                        }
                    })();
                }
            }
        } catch (e) {
            console.error("Notification logic failed:", e);
        }

        return NextResponse.json({ success: true, intentDrift });

    } catch (error) {
        console.error("Save raw content error:", error);
        return NextResponse.json({ error: "Failed to save content" }, { status: 500 });
    }
}

// Rename file (or move if path changes)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name } = await req.json();

        if (!name) {
            return NextResponse.json({ error: "New name is required" }, { status: 400 });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        if (file.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Update DB
        await db.file.update({
            where: { id: fileId },
            data: {
                name,
                updatedAt: new Date(),
            }
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "RENAME_FILE",
                entity: "File",
                entityId: fileId,
                details: { oldName: file.name, newName: name }
            });
        } catch {
            // Ignore audit logging errors
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Rename file error:", error);
        return NextResponse.json({ error: "Failed to rename file" }, { status: 500 });
    }
}

// Delete file
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: {
                team: {
                    include: {
                        members: true
                    }
                }
            }
        });

        if (!file) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const userId = session.user.id;
        let canDelete = false;

        if (file.teamId) {
            // Team File RBAC
            const membership = file.team?.members.find(m => m.userId === userId);

            if (!membership) {
                return NextResponse.json({ error: "Access denied" }, { status: 403 });
            }

            if (membership.role === "OWNER" || membership.role === "ADMIN") {
                canDelete = true;
            } else if (file.userId === userId) {
                canDelete = true;
            }
        } else {
            // Personal File RBAC
            if (file.userId === userId) {
                canDelete = true;
            }
        }

        if (!canDelete) {
            return NextResponse.json(
                { error: "You do not have permission to delete this file" },
                { status: 403 }
            );
        }

        await db.file.delete({
            where: { id: fileId }
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "DELETE_FILE",
                entity: "File",
                entityId: fileId,
                details: { name: file.name, teamId: file.teamId }
            });
        } catch {
            // Ignore audit logging errors
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Delete file error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
