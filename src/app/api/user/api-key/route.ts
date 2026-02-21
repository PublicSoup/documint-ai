import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

function toSettingsObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Prisma.JsonObject;
    }
    return {};
}

function getApiKeyFromSettings(settings: Prisma.JsonObject): string | null {
    const value = settings.apiKey;
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function maskApiKey(apiKey: string | null): string | null {
    if (!apiKey) {
        return null;
    }

    const visiblePrefix = apiKey.slice(0, 4);
    return `${visiblePrefix}${"*".repeat(16)}`;
}

/**
 * GET /api/user/api-key
 * Returns a masked representation of the current API key.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const settings = toSettingsObject(user?.settings);
        const apiKey = getApiKeyFromSettings(settings);

        return NextResponse.json({ apiKey: maskApiKey(apiKey) });
    } catch (error) {
        console.error("Failed to fetch API key:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * POST /api/user/api-key
 * Generates and stores a rotated API key.
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "security");

        const key = `dm_${randomBytes(24).toString("hex")}`;

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { settings: true },
        });

        const currentSettings = toSettingsObject(user?.settings);

        await db.user.update({
            where: { id: session.user.id },
            data: {
                settings: {
                    ...currentSettings,
                    apiKey: key,
                },
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "ROTATE_API_KEY",
                entity: "User",
                entityId: session.user.id,
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ apiKey: key });
    } catch (error) {
        console.error("API Key generation error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
