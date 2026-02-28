import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody, validateQuery } from "@/lib/api-utils";

const notificationsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

const patchNotificationsSchema = z
    .object({
        id: z.string().trim().min(1).max(100).optional(),
        markAllRead: z.boolean().optional(),
    })
    .strict()
    .refine((value) => value.id !== undefined || value.markAllRead === true, {
        message: "id or markAllRead=true is required",
    })
    .refine((value) => !(value.id && value.markAllRead === true), {
        message: "Provide either id or markAllRead=true, not both",
    });

const deleteNotificationsQuerySchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

const NO_STORE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
};

function jsonNoStore(payload: unknown, init?: { status?: number }) {
    return NextResponse.json(payload, {
        ...init,
        headers: NO_STORE_HEADERS,
    });
}

/**
 * GET /api/notifications
 * Fetch current user's notifications.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { limit } = validateQuery(
            new URL(req.url).searchParams,
            notificationsQuerySchema,
        );

        const [notifications, unreadCount] = await Promise.all([
            db.notification.findMany({
                where: { userId: session.user.id },
                orderBy: { createdAt: "desc" },
                take: limit,
            }),
            db.notification.count({
                where: { userId: session.user.id, read: false },
            }),
        ]);

        return jsonNoStore({ notifications, unreadCount });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * PATCH /api/notifications
 * Mark one notification as read or mark all as read.
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { id, markAllRead } = await validateBody(req, patchNotificationsSchema);

        if (markAllRead) {
            const result = await db.notification.updateMany({
                where: { userId: session.user.id, read: false },
                data: { read: true },
            });

            if (result.count > 0) {
                try {
                    const { logAudit } = await import("@/lib/audit-logger");
                    await logAudit({
                        userId: session.user.id,
                        action: "READ_ALL_NOTIFICATIONS",
                        entity: "Notification",
                        entityId: session.user.id,
                        details: { count: result.count },
                    });
                } catch {
                    // Keep endpoint non-blocking if audit logging fails.
                }
            }

            return jsonNoStore({ success: true, updated: result.count });
        }

        if (!id) {
            throw ApiErrors.badRequest("Notification ID is required");
        }

        const updateResult = await db.notification.updateMany({
            where: { id, userId: session.user.id },
            data: { read: true },
        });

        if (updateResult.count === 0) {
            throw ApiErrors.notFound("Notification");
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "READ_NOTIFICATION",
                entity: "Notification",
                entityId: id,
            });
        } catch {
            // Keep endpoint non-blocking if audit logging fails.
        }

        return jsonNoStore({ success: true, updated: updateResult.count });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * DELETE /api/notifications
 * Delete one notification by id.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { id } = validateQuery(
            new URL(req.url).searchParams,
            deleteNotificationsQuerySchema,
        );

        const result = await db.notification.deleteMany({
            where: { id, userId: session.user.id },
        });

        if (result.count === 0) {
            throw ApiErrors.notFound("Notification");
        }

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "DELETE_NOTIFICATION",
                entity: "Notification",
                entityId: id,
            });
        } catch {
            // Keep endpoint non-blocking if audit logging fails.
        }

        return jsonNoStore({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}
