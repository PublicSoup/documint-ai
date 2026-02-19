import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hash, compare } from "bcryptjs";

const userUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    currentPassword: z.string().min(1).max(256).optional(),
    newPassword: z.string().min(8).max(256).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
}).strict();

export async function PATCH(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const parsed = userUpdateSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
        }

        const { name, currentPassword, newPassword, settings } = parsed.data;

        const updateData: {
            name?: string;
            settings?: Record<string, unknown>;
            password?: string;
        } = {};

        // Update display name
        if (name !== undefined) {
            updateData.name = name;
        }

        // Update settings/preferences (JSON field)
        if (settings !== undefined) {
            updateData.settings = settings;
        }

        // Password change (requires current password verification)
        if (newPassword) {
            if (!currentPassword) {
                return NextResponse.json(
                    { error: "Current password is required to set a new password" },
                    { status: 400 }
                );
            }

            const user = await db.user.findUnique({
                where: { id: session.user.id },
                select: { password: true },
            });

            if (!user?.password) {
                return NextResponse.json(
                    { error: "Cannot change password for OAuth accounts" },
                    { status: 400 }
                );
            }

            const isValid = await compare(currentPassword, user.password);
            if (!isValid) {
                return NextResponse.json(
                    { error: "Current password is incorrect" },
                    { status: 403 }
                );
            }

            updateData.password = await hash(newPassword, 12);
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const updatedUser = await db.user.update({
            where: { id: session.user.id },
            data: updateData,
            select: { id: true, name: true, email: true },
        });

        // Audit Logging
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            if (updateData.password) {
                await logAudit({
                    userId: session.user.id,
                    action: "CHANGE_PASSWORD",
                    entity: "User",
                    entityId: session.user.id,
                    details: { method: "profile-update" }
                });
            }
            if (name !== undefined) {
                await logAudit({
                    userId: session.user.id,
                    action: "UPDATE_PROFILE",
                    entity: "User",
                    entityId: session.user.id,
                    details: { field: "name" }
                });
            }
        } catch {}

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        console.error("Failed to update user:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
}
