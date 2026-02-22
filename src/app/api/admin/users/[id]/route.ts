import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, ApiErrors } from "@/lib/api-utils";

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

const updateUserSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(100).optional(),
    password: z.string().min(8).max(100).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});

/**
 * PUT /api/admin/users/[id]
 * Updates a user's basic details. Admin only.
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) return adminCheck.response!;

        if (adminCheck.session?.user?.id) {
            await enforceRateLimit(adminCheck.session.user.id, "api");
        }

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid user ID"));
        }
        const { id } = parsedParams.data;

        const body = await validateBody(req, updateUserSchema);
        const { name, email, password } = body;

        const dataToUpdate: Prisma.UserUpdateInput = {};
        if (name) dataToUpdate.name = name;
        if (email) dataToUpdate.email = email;
        if (password) {
            dataToUpdate.password = await hash(password, 12);
        }

        const updatedUser = await db.user.update({
            where: { id },
            data: dataToUpdate,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
            }
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: adminCheck.session?.user?.id,
                action: "ADMIN_UPDATE_USER_DETAILS",
                entity: "User",
                entityId: id,
                details: { 
                    updatedFields: Object.keys(dataToUpdate).filter(f => f !== 'password'),
                    passwordChanged: !!password
                }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json(updatedUser);
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * DELETE /api/admin/users/[id]
 * Deletes a user and all associated data. Admin only.
 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) return adminCheck.response!;

        if (adminCheck.session?.user?.id) {
            await enforceRateLimit(adminCheck.session.user.id, "api");
        }

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid user ID"));
        }
        const { id } = parsedParams.data;

        // Prevent deleting self
        if (adminCheck.session?.user?.id === id) {
            return errorResponse(ApiErrors.badRequest("Cannot delete yourself"));
        }

        const existingUser = await db.user.findUnique({
            where: { id },
            select: { id: true }
        });

        if (!existingUser) {
            return errorResponse(ApiErrors.notFound("User"));
        }

        await db.user.delete({
            where: { id }
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: adminCheck.session?.user?.id,
                action: "ADMIN_DELETE_USER",
                entity: "User",
                entityId: id,
                details: { targetUserId: id }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ success: true, message: "User Deleted" });
    } catch (error) {
        return errorResponse(error);
    }
}
