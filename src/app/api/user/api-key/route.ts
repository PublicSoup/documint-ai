import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { saveUserApiKey, deleteUserApiKey, getUserAiUsage } from "@/lib/ai-usage";
import { validateApiKey as validateGoogleApiKey } from "@/lib/ai";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, validateBody } from "@/lib/api-utils";
import { db } from "@/lib/db";

const saveKeySchema = z.object({
    apiKey: z
        .string()
        .trim()
        .min(20, "API key seems too short")
        .max(200, "API key seems too long")
        .regex(/^[A-Za-z0-9_\-]+$/, "API key contains invalid characters"),
}).strict();

/**
 * GET /api/user/api-key
 * Returns whether the user has a saved API key (never exposes the key itself).
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
 * Save the user's API key (encrypted at rest).
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "security");

        const { apiKey } = await validateBody(req, saveKeySchema);

        const validation = await validateGoogleApiKey(apiKey);
        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error || "Invalid Google API key" },
                { status: 400 }
            );
        }

        await saveUserApiKey(session.user.id, apiKey);

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * DELETE /api/user/api-key
 * Remove the user's API key.
 */
export async function DELETE() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await deleteUserApiKey(session.user.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}