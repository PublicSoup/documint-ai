import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserSubscription } from "@/lib/subscription";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const onboardingSchema = z.object({
    dismissed: z.boolean(),
    intent: z.enum(["signup", "trial"]).optional(),
    plan: z.enum(["starter", "pro", "team"]).optional(),
    source: z.string().trim().min(1).max(80).regex(/^[a-z0-9_\-]+$/i).optional(),
}).strict();

/**
 * GET /api/onboarding
 * Returns onboarding progress steps and dismissed state for the current user.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        // Rate limit
        await enforceRateLimit(session.user.id, "api");

        const userId = session.user.id;

        // 1. Check progress steps
        const [fileCount, sharedCount, subscription, user] = await Promise.all([
            db.file.count({ where: { userId } }),
            db.documentation.count({
                where: {
                    isPublic: true,
                    file: { userId }
                }
            }),
            getUserSubscription(userId),
            db.user.findUnique({
                where: { id: userId },
                select: { settings: true }
            })
        ]);

        const isPro = subscription.isPro || subscription.isTeam;
        const settings = (user?.settings as { onboardingDismissed?: boolean } | null) || {};
        const isDismissed = !!settings.onboardingDismissed;

        return NextResponse.json({
            steps: {
                hasAccount: true,
                hasScanned: fileCount > 0,
                hasShared: sharedCount > 0,
                hasUpgraded: isPro,
            },
            isDismissed
        });

    } catch (error) {
        return errorResponse(error);
    }
}

/**
 * POST /api/onboarding
 * Updates the dismissed state of the onboarding checklist in user settings.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const userId = session.user.id;
        const { dismissed, intent, plan, source } = await validateBody(request, onboardingSchema);

        // Fetch current settings to preserve other keys
        const user = await db.user.findUnique({ 
            where: { id: userId }, 
            select: { settings: true } 
        });
        
        const currentSettings = (user?.settings as Record<string, unknown> | null) || {};

        await db.user.update({
            where: { id: userId },
            data: {
                settings: {
                    ...currentSettings,
                    onboardingDismissed: dismissed
                }
            }
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId,
                action: "UPDATE_ONBOARDING_PREFERENCES",
                entity: "UserSettings",
                entityId: userId,
                details: {
                    dismissed,
                    intent: intent ?? null,
                    plan: plan ?? null,
                    source: source ?? null,
                },
            });
        } catch {
            // Non-blocking audit logging.
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        return errorResponse(error);
    }
}
