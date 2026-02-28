import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody, validateQuery, ApiErrors } from "@/lib/api-utils";

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
}).strict();

const updateRoleSchema = z.object({
    userId: z.string().min(1),
    role: z.enum(["USER", "ADMIN", "EDITOR"]), // Based on your Prisma schema roles
}).strict();

/**
 * GET /api/admin/users
 * Returns a paginated list of all users. Admin only.
 */
export async function GET(request: NextRequest) {
    try {
        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) return adminCheck.response!;

        // Rate limiting for admin requests
        if (adminCheck.session?.user?.id) {
            await enforceRateLimit(adminCheck.session.user.id, "api");
        }

        const { searchParams } = new URL(request.url);
        const { page, limit, search } = validateQuery(searchParams, querySchema);

        const where: Prisma.UserWhereInput = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
            ];
        }

        const [users, total] = await db.$transaction([
            db.user.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    role: true,
                    emailVerified: true,
                    createdAt: true,
                    subscription: {
                        select: { plan: true, status: true }
                    },
                    _count: {
                        select: { files: true }
                    }
                }
            }),
            db.user.count({ where })
        ]);

        return NextResponse.json({
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * PATCH /api/admin/users
 * Update a user's role. Admin only.
 */
export async function PATCH(req: NextRequest) {
    try {
        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) return adminCheck.response!;

        const actorUserId = adminCheck.session?.user?.id;
        if (!actorUserId) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(actorUserId, "api");

        const { userId, role } = await validateBody(req, updateRoleSchema);

        if (userId === actorUserId) {
            throw ApiErrors.badRequest("You cannot change your own role");
        }

        const targetUser = await db.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true },
        });

        if (!targetUser) {
            throw ApiErrors.notFound("User");
        }

        if (targetUser.role === role) {
            return NextResponse.json({
                user: {
                    id: targetUser.id,
                    role: targetUser.role,
                },
                unchanged: true,
            });
        }

        if (targetUser.role === "ADMIN" && role !== "ADMIN") {
            const adminCount = await db.user.count({ where: { role: "ADMIN" } });
            if (adminCount <= 1) {
                throw ApiErrors.conflict("Cannot demote the last admin user");
            }
        }

        const updatedUser = await db.user.update({
            where: { id: userId },
            data: { role },
            select: { id: true, email: true, role: true }
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: actorUserId,
                action: "ADMIN_UPDATE_USER_ROLE",
                entity: "User",
                entityId: userId,
                details: {
                    previousRole: targetUser.role,
                    newRole: role,
                }
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ user: updatedUser });

    } catch (error) {
        return errorResponse(error);
    }
}
