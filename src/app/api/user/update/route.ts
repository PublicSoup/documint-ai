import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { hash, compare } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const jsonValueSchema: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(jsonValueSchema),
        z.record(z.string(), jsonValueSchema),
    ]),
);

const userUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    currentPassword: z.string().min(1).max(256).optional(),
    newPassword: z.string().min(8).max(256).optional(),
    settings: z.record(z.string().trim().min(1).max(80), jsonValueSchema).optional(),
}).strict()
    .refine((data) => !(data.currentPassword && !data.newPassword), {
        message: "New password is required when current password is provided",
        path: ["newPassword"],
    })
    .refine((data) => !data.newPassword || !!data.currentPassword, {
        message: "Current password is required to set a new password",
        path: ["currentPassword"],
    });

const DISALLOWED_SETTINGS_KEYS = new Set([
    "apiKey",
    "apiKeyLabel",
    "apiKeyCreatedAt",
]);

function toSettingsObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Prisma.JsonObject;
    }
    return {};
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        let rawBody: unknown;
        try {
            rawBody = await request.json();
        } catch {
            throw ApiErrors.badRequest("Invalid JSON body");
        }

        const parsed = userUpdateSchema.safeParse(rawBody);
        if (!parsed.success) {
            throw ApiErrors.badRequest("Invalid request payload", parsed.error.flatten());
        }

        const { name, currentPassword, newPassword, settings } = parsed.data;

        if (newPassword) {
            await enforceRateLimit(session.user.id, "security");
        }
        const updateData: Prisma.UserUpdateInput = {};

        if (name !== undefined) {
            updateData.name = name;
        }

        if (settings !== undefined) {
            const blockedKey = Object.keys(settings).find((key) => DISALLOWED_SETTINGS_KEYS.has(key));
            if (blockedKey) {
                throw ApiErrors.forbidden(`Updating settings key '${blockedKey}' is not allowed via this endpoint`);
            }

            const user = await db.user.findUnique({
                where: { id: session.user.id },
                select: { settings: true },
            });

            const currentSettings = toSettingsObject(user?.settings);
            const mergedSettings = {
                ...currentSettings,
                ...settings,
            } as Prisma.InputJsonObject;

            updateData.settings = mergedSettings;
        }

        if (newPassword) {
            const user = await db.user.findUnique({
                where: { id: session.user.id },
                select: { password: true },
            });

            if (!user?.password) {
                throw ApiErrors.badRequest("Cannot change password for OAuth accounts");
            }

            if (!currentPassword) {
                throw ApiErrors.badRequest("Current password is required to set a new password");
            }

            const isValid = await compare(currentPassword, user.password);
            if (!isValid) {
                throw ApiErrors.forbidden("Current password is incorrect");
            }

            updateData.password = await hash(newPassword, 12);
        }

        if (Object.keys(updateData).length === 0) {
            throw ApiErrors.badRequest("No fields to update");
        }

        const updatedUser = await db.user.update({
            where: { id: session.user.id },
            data: updateData,
            select: { id: true, name: true, email: true },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");

            if (updateData.password) {
                await logAudit({
                    userId: session.user.id,
                    action: "CHANGE_PASSWORD",
                    entity: "User",
                    entityId: session.user.id,
                    details: { method: "profile-update" },
                });
            }

            if (name !== undefined) {
                await logAudit({
                    userId: session.user.id,
                    action: "UPDATE_PROFILE",
                    entity: "User",
                    entityId: session.user.id,
                    details: { field: "name" },
                });
            }

            if (settings !== undefined) {
                await logAudit({
                    userId: session.user.id,
                    action: "UPDATE_USER_SETTINGS",
                    entity: "User",
                    entityId: session.user.id,
                    details: { updatedKeys: Object.keys(settings) },
                });
            }
        } catch {
            // Keep profile update non-blocking if audit logging fails
        }

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error) {
        return errorResponse(error);
    }
}
