import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const createApiKeySchema = z
    .object({
        name: z.string().trim().min(1).max(64).default("Default Key"),
    })
    .strict();

type UserSettings = {
    apiKey?: string;
    apiKeyLabel?: string;
    apiKeyCreatedAt?: string;
};

function toSettings(value: Prisma.JsonValue | null | undefined): UserSettings {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const record = value as Record<string, unknown>;
    return {
        apiKey: typeof record.apiKey === "string" ? record.apiKey : undefined,
        apiKeyLabel: typeof record.apiKeyLabel === "string" ? record.apiKeyLabel : undefined,
        apiKeyCreatedAt: typeof record.apiKeyCreatedAt === "string" ? record.apiKeyCreatedAt : undefined,
    };
}

function maskApiKey(apiKey: string): string {
    const prefix = apiKey.slice(0, 6);
    const suffix = apiKey.slice(-4);
    return `${prefix}${"*".repeat(24)}${suffix}`;
}

// GET /api/keys - List user's API keys (masked)
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, settings: true },
        });

        if (!user) {
            throw ApiErrors.notFound("User");
        }

        const settings = toSettings(user.settings);
        const apiKey = settings.apiKey;
        const hasApiKey = typeof apiKey === "string" && apiKey.length > 0;

        return NextResponse.json({
            keys: hasApiKey
                ? [
                    {
                        id: "primary",
                        name: settings.apiKeyLabel ?? "Default Key",
                        maskedKey: maskApiKey(apiKey),
                        createdAt: settings.apiKeyCreatedAt ?? null,
                    },
                ]
                : [],
            message: hasApiKey ? undefined : "No API key found. Generate one to get started.",
        });
    } catch (error) {
        return errorResponse(error);
    }
}

// POST /api/keys - Rotate primary API key
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "security");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, settings: true },
        });

        if (!user) {
            throw ApiErrors.notFound("User");
        }

        const { name } = await validateBody(req, createApiKeySchema);

        const generatedKey = `dm_${randomBytes(24).toString("hex")}`;
        const generatedAt = new Date().toISOString();

        const currentSettings = toSettings(user.settings);

        await db.user.update({
            where: { id: user.id },
            data: {
                settings: {
                    ...currentSettings,
                    apiKey: generatedKey,
                    apiKeyLabel: name,
                    apiKeyCreatedAt: generatedAt,
                } satisfies Prisma.InputJsonValue,
            },
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: user.id,
                action: "ROTATE_API_KEY",
                entity: "ApiKey",
                entityId: user.id,
                details: {
                    name,
                    keyPrefix: generatedKey.slice(0, 6),
                },
            });
        } catch {
            // Keep mutation non-blocking if audit persistence fails.
        }

        return NextResponse.json({
            key: generatedKey,
            name,
            createdAt: generatedAt,
            warning: "Save this key securely. It won't be shown again.",
        });
    } catch (error) {
        return errorResponse(error);
    }
}
