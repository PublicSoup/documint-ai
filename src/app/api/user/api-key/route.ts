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

        // Verify the key, but never let a flaky/slow live check block the save —
        // a valid key can fail verification (no credits, model access, network),
        // and blocking left users unable to save at all. Bounded so it can't hang.
        let verified = false;
        let verifyError: string | undefined;
        try {
            const validation = await Promise.race([
                validateProviderApiKey(provider, storedValue),
                new Promise<{ valid: boolean; error?: string }>((resolve) =>
                    setTimeout(() => resolve({ valid: false, error: "verification timed out" }), 12_000),
                ),
            ]);
            verified = validation.valid;
            verifyError = validation.error;
        } catch (e) {
            verifyError = e instanceof Error ? e.message : "verification failed";
        }

        try {
            await saveUserApiKey(session.user.id, provider, storedValue);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            // Storing BYO keys requires ENCRYPTION_KEY (a 64-hex-char secret). If
            // it's missing/misconfigured, saving throws — surface that precisely so
            // the operator can fix the env var instead of chasing a generic 500.
            if (/ENCRYPTION_KEY/i.test(msg)) {
                return NextResponse.json(
                    { error: "Server can't store API keys: ENCRYPTION_KEY is not set (needs a 64-hex-character value). Set it in the deployment env and redeploy." },
                    { status: 500 }
                );
            }
            return NextResponse.json({ error: `Could not save API key: ${msg}` }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            verified,
            warning: verified ? undefined : `Saved, but couldn't verify the key right now${verifyError ? ` (${verifyError})` : ""}. It'll be used as-is.`,
        });
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
