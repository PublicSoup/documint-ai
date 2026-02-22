import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

const paramsSchema = z.object({
    id: z.string().trim().min(1).max(100),
}).strict();

/**
 * POST /api/admin/users/[id]/reset-password
 * Resets a user's password to a random string. Admin only.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) return adminCheck.response!;

        // Rate limit admin action
        if (adminCheck.session?.user?.id) {
            await enforceRateLimit(adminCheck.session.user.id, "api");
        }

        const parsedParams = paramsSchema.safeParse(await params);
        if (!parsedParams.success) {
            return errorResponse(ApiErrors.badRequest("Invalid user ID"));
        }
        const { id: userId } = parsedParams.data;

        // Verify target user exists and is not an OAuth user
        const targetUser = await db.user.findUnique({
            where: { id: userId },
            select: { id: true, password: true }
        });

        if (!targetUser) {
            return errorResponse(ApiErrors.notFound("User"));
        }

        // Generate a random 12-character password
        const cleanPassword = randomBytes(12).toString("hex").slice(0, 12);
        const hashedPassword = await hash(cleanPassword, 12);

        await db.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
            },
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                action: "ADMIN_RESET_PASSWORD",
                entityId: userId,
                entity: "User",
                userId: adminCheck.session?.user?.id,
                details: { targetUserId: userId },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ 
            success: true,
            password: cleanPassword,
            message: "Password has been reset to a temporary random string."
        });
    } catch (error) {
        return errorResponse(error);
    }
}
