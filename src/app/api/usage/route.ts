import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription } from "@/lib/subscription";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

/**
 * GET /api/usage
 * Returns detailed usage statistics and plan limits for the current user.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Get user's subscription and limits
        const subscription = await getUserSubscription(session.user.id);

        // 3. Get usage stats (current month)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [filesThisMonth, totalFiles] = await Promise.all([
            db.file.count({
                where: {
                    userId: session.user.id,
                    createdAt: { gte: startOfMonth },
                },
            }),
            db.file.count({
                where: { userId: session.user.id },
            })
        ]);

        // 4. Formatting for UI
        const validUntil = subscription.currentPeriodEnd
            ? subscription.currentPeriodEnd.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            })
            : new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });

        const planDisplay = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);

        return NextResponse.json({
            // Usage stats
            filesProcessed: filesThisMonth,
            filesLimit: subscription.limits.filesPerMonth === -1 ? "Unlimited" : subscription.limits.filesPerMonth,
            totalFiles,
            totalFilesLimit: subscription.limits.totalFiles === -1 ? "Unlimited" : subscription.limits.totalFiles,

            // Plan info
            plan: planDisplay,
            planId: subscription.plan,
            status: subscription.status,
            isActive: subscription.isActive,
            validUntil,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            isDevMode: subscription.isDevMode,

            // Feature access
            features: subscription.limits.features,

            // Upgrade info
            canUpgrade: subscription.plan !== "team",
            upgradePlan: subscription.plan === "free" ? "starter" : subscription.plan === "starter" ? "pro" : "team",
        });
    } catch (error) {
        // Return a valid fallback structure so UI doesn't crash on auth/limit errors
        console.error("Usage API Error:", error);
        return NextResponse.json({
            filesProcessed: 0,
            filesLimit: 10,
            totalFiles: 0,
            totalFilesLimit: 25,
            plan: "Free",
            planId: "free",
            status: "active",
            isActive: true,
            validUntil: "N/A",
            cancelAtPeriodEnd: false,
            isDevMode: false,
            features: {},
            canUpgrade: true,
            upgradePlan: "starter"
        });
    }
}
