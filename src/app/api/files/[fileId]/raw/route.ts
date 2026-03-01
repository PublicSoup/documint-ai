import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { uploadFile } from "@/lib/supabase/storage";
import { getUserSubscription } from "@/lib/subscription";
import { getLocalFile, updateLocalFile, isLocalFileId } from "@/lib/local-dev-storage";
import { detectIntentDrift } from "@/lib/ai";
import { sendNotification } from "@/lib/notifications";
import { checkFilePermission, checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const updateContentSchema = z.object({
    content: z.string().max(1024 * 1024 * 5), // 5MB limit
}).strict();

const renameFileSchema = z.object({
    name: z.string().trim().min(1).max(255).regex(/^[^/\\\0]+$/, "Invalid file name"),
}).strict();

// Get raw file content
export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    try {
        const { fileId } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        // DEV MODE BYPASS
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            const file = await getLocalFile(fileId);
            if (!file) {
                throw ApiErrors.notFound("File");
            }
            return NextResponse.json({ content: file.content });
        }

        const file = await db.file.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            throw ApiErrors.notFound("File");
        }

        // Check Access
        if (file.userId !== session.user.id) {
            const hasAccess = file.teamId 
                ? await checkTeamPermission(session.user.id, file.teamId, "view")
                : false;
            
            if (!hasAccess) {
                throw ApiErrors.forbidden();
            }
        }

        // Enforce Paid Plan for Code View
        const subscription = await getUserSubscription(session.user.id);
        if (!subscription || !subscription.isActive) {
            throw ApiErrors.paymentRequired("Upgrade to Pro to view source code");
        }

        const content = await getFileContent(file.id);

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
            // Non-blocking
        }

        return NextResponse.json({ content });

    } catch (error) {
        return errorResponse(error);
    }
}

// Update raw file content
export async function PUT(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    try {
        const { fileId } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "upload");

        const { content } = await validateBody(req, updateContentSchema);

        // DEV MODE BYPASS
        if (isLocalFileId(fileId) || session.user.id.startsWith("dev-")) {
            const success = await updateLocalFile(fileId, content);
            if (!success) {
                throw ApiErrors.notFound("File");
            }
            return NextResponse.json({ success: true });
        }

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            throw ApiErrors.forbidden();
        }

        const file = await db.file.findUnique({ where: { id: fileId }, include: { documentation: true } });
        if (!file) {
            throw ApiErrors.notFound("File");
        }

        // Upload to storage
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

        // Drift Detection Logic
        if (updatedFile.documentation) {
            await db.documentation.update({
                where: { id: updatedFile.documentation.id },
                data: { status: "DRAFT" }
            });

            // Async Drift Check (Fire & Forget to avoid blocking response)
            (async () => {
                try {
                    const intentResult = await detectIntentDrift(content, updatedFile.documentation?.content || "");
                    if (intentResult.drifted) {
                        await db.reviewRequest.create({
                            data: {
                                documentationId: updatedFile.documentation!.id,
                                requesterId: session.user.id,
                                status: "PENDING",
                                comments: `AI Shadowing detected intent drift: ${intentResult.reasoning}`
                            }
                        });

                        await db.documentation.update({
                            where: { id: updatedFile.documentation!.id },
                            data: { status: "REVIEW" }
                        });

                        const { logAudit } = await import("@/lib/audit-logger");
                        await logAudit({
                            userId: session.user.id,
                            action: "INTENT_DRIFT_DETECTED",
                            entity: "Documentation",
                            entityId: updatedFile.documentation!.id,
                            details: { 
                                reasoning: intentResult.reasoning,
                                fileName: updatedFile.name
                            }
                        });

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
            })();
        }

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
            // Non-blocking
        }

        // Handle Notifications / Auto-Regen logic asynchronously
        (async () => {
             try {
                const user = await db.user.findUnique({
                    where: { id: session.user.id },
                    select: { email: true, name: true, settings: true }
                });
                const settings = (user?.settings ?? {}) as {
                    autoRegenerate?: boolean;
                    notifyOnDocChange?: boolean;
                };

                if (settings.notifyOnDocChange) {
                    await sendNotification({
                        userId: session.user.id,
                        teamId: updatedFile.teamId || undefined,
                        type: "DOC_DRIFT",
                        title: "Documentation Drift Detected",
                        message: `The file **${updatedFile.name}** was updated. Associated documentation is now marked as DRAFT.`,
                        fileId: fileId,
                        fileName: updatedFile.name
                    });
                }
            } catch (e) {
                console.error("Async notification failed:", e);
            }
        })();

        return NextResponse.json({ success: true, intentDrift });

    } catch (error) {
        return errorResponse(error);
    }
}

// Rename file
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    try {
        const { fileId } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { name } = await validateBody(req, renameFileSchema);

        const canEdit = await checkFilePermission(session.user.id, fileId, "edit");
        if (!canEdit) {
            throw ApiErrors.forbidden();
        }

        const file = await db.file.findUnique({ where: { id: fileId } });
        if (!file) {
            throw ApiErrors.notFound("File");
        }

        // Check for duplicate names in the same scope
        const duplicate = await db.file.findFirst({
            where: {
                id: { not: fileId },
                name: name,
                teamId: file.teamId,
                userId: file.teamId ? undefined : file.userId,
            },
            select: { id: true },
        });

        if (duplicate) {
            throw ApiErrors.conflict("A file with that name already exists");
        }

        await db.file.update({
            where: { id: fileId },
            data: {
                name,
                updatedAt: new Date(),
            }
        });

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
            // Non-blocking
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        return errorResponse(error);
    }
}

// Delete file
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
    try {
        const { fileId } = await params;
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "security");

        const canDelete = await checkFilePermission(session.user.id, fileId, "delete");
        
        if (!canDelete) {
            throw ApiErrors.forbidden("You do not have permission to delete this file");
        }

        const file = await db.file.findUnique({ where: { id: fileId } });
        if (!file) {
            throw ApiErrors.notFound("File");
        }

        await db.file.delete({
            where: { id: fileId }
        });

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
            // Non-blocking
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        return errorResponse(error);
    }
}
