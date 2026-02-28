import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

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

const settingsPatchSchema = z.record(z.string().trim().min(1).max(80), jsonValueSchema).refine(
    (value) => Object.keys(value).length <= 200,
    { message: "Too many settings fields" },
);

function toSettingsObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Prisma.JsonObject;
    }
    return {};
}

export async function GET(_req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        return NextResponse.json({ settings: toSettingsObject(user?.settings) });
    } catch (error) {
        return errorResponse(error);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const updates = await validateBody(req, settingsPatchSchema);

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const currentSettings = toSettingsObject(user?.settings);
        const mergedSettings = {
            ...currentSettings,
            ...updates,
        } as Prisma.InputJsonObject;

        const updatedUser = await db.user.update({
            where: { id: session.user.id },
            data: { settings: mergedSettings },
            select: { settings: true },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "UPDATE_USER_SETTINGS",
                entity: "User",
                entityId: session.user.id,
                details: {
                    updatedFields: Object.keys(updates),
                },
            });
        } catch {
            // Keep mutation non-blocking if audit persistence fails.
        }

        return NextResponse.json({ settings: toSettingsObject(updatedUser.settings) });
    } catch (error) {
        return errorResponse(error);
    }
}
