import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { saveUserApiKey, deleteUserApiKey, getUserAiUsage, AI_KEY_PROVIDERS } from "@/lib/ai-usage";
import { validateProviderApiKey } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody } from "@/lib/api-utils";
import { db } from "@/lib/db";

const saveKeySchema = z.object({
    provider: z.enum(AI_KEY_PROVIDERS).default("google"),
    apiKey: z
        .string()
        .trim()
        .min(20, "API key seems too short")
        .max(200, "API key seems too long")
        .regex(/^[A-Za-z0-9_\-]+$/, "API key contains invalid characters"),
}).strict();

const PROVIDER_LABELS: Record<(typeof AI_KEY_PROVIDERS)[number], string> = {
    google: "Google AI",
    anthropic: "Anthropic",
    openai: "OpenAI",
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

        const { provider, apiKey } = await validateBody(req, saveKeySchema);

        const validation = await validateProviderApiKey(provider, apiKey);
        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error || `Invalid ${PROVIDER_LABELS[provider]} API key` },
                { status: 400 }
            );
        }

        await saveUserApiKey(session.user.id, provider, apiKey);

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
