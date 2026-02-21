import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        return NextResponse.json({ settings: toSettingsObject(user?.settings) });
    } catch (error) {
        console.error("Error fetching settings:", error);
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await enforceRateLimit(session.user.id, "api");

        const parsedBody = settingsPatchSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
        }

        const updates = parsedBody.data;

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

        return NextResponse.json({ settings: toSettingsObject(updatedUser.settings) });
    } catch (error) {
        console.error("Error updating settings:", error);
        return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
    }
}
