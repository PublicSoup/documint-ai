import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { saveUserApiKey, deleteUserApiKey, getUserAiUsage, AI_KEY_PROVIDERS } from "@/lib/ai-usage";
import { validateProviderApiKey } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody } from "@/lib/api-utils";
import { db } from "@/lib/db";

const apiKeyField = z
    .string()
    .trim()
    .min(16, "API key seems too short")
    .max(256, "API key seems too long")
    .regex(/^[A-Za-z0-9_.\-]+$/, "API key contains invalid characters");

const saveKeySchema = z.object({
    provider: z.enum(AI_KEY_PROVIDERS).default("google"),
    apiKey: apiKeyField,
    // Required when provider is "custom" (enforced in the handler)
    baseUrl: z
        .string()
        .trim()
        .url("Base URL must be a valid URL")
        .max(300)
        .refine(url => url.startsWith("https://"), "Base URL must use HTTPS")
        .optional(),
    modelId: z.string().trim().min(1).max(120).optional(),
}).strict();

const PROVIDER_LABELS: Record<(typeof AI_KEY_PROVIDERS)[number], string> = {
    google: "Google AI",
    anthropic: "Anthropic",
    openai: "OpenAI",
    xai: "xAI",
    deepseek: "DeepSeek",
    openrouter: "OpenRouter",
    custom: "custom provider",
};

/**
 * GET /api/user/api-key
 * Returns which providers have a saved API key (never exposes the keys themselves).
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { encryptedApiKey: true },
        });

        // Also return usage stats for the settings UI
        const usage = await getUserAiUsage(session.user.id);

        return NextResponse.json({
            hasKey: !!user?.encryptedApiKey,
            usage,
        });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * POST /api/user/api-key
 * Save one of the user's API keys (encrypted at rest).
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "security");

        const { provider, apiKey, baseUrl, modelId } = await validateBody(req, saveKeySchema);

        let storedValue = apiKey;
        if (provider === "custom") {
            if (!baseUrl || !modelId) {
                return NextResponse.json(
                    { error: "Custom providers require a base URL and a model ID" },
                    { status: 400 }
                );
            }
            storedValue = JSON.stringify({ apiKey, baseUrl, modelId });
        }

        const validation = await validateProviderApiKey(provider, storedValue);
        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error || `Invalid ${PROVIDER_LABELS[provider]} API key` },
                { status: 400 }
            );
        }

        await saveUserApiKey(session.user.id, provider, storedValue);

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * DELETE /api/user/api-key?provider=google|anthropic|openai
 * Remove one of the user's API keys, or all of them when no provider is given.
 */
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const providerParam = req.nextUrl.searchParams.get("provider");
        const provider = AI_KEY_PROVIDERS.find(p => p === providerParam);
        if (providerParam && !provider) {
            return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
        }

        await deleteUserApiKey(session.user.id, provider);

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}
