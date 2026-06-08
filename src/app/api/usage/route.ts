import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription } from "@/lib/subscription";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { getUserAiUsage } from "@/lib/ai-usage";

/**
 * GET /api/usage
 * Returns detailed usage statistics and plan limits for the current user.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const subscription = await getUserSubscription(session.user.id);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [filesThisMonth, totalFiles, aiUsage] = await Promise.all([
            db.file.count({
                where: {
                    userId: session.user.id,
                    createdAt: { gte: startOfMonth },
                },
            }),
            db.file.count({
                where: { userId: session.user.id },
            }),
            getUserAiUsage(session.user.id),
        ]);

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
            filesProcessed: filesThisMonth,
            filesLimit: subscription.limits.filesPerMonth === -1 ? "Unlimited" : subscription.limits.filesPerMonth,
            totalFiles,
            totalFilesLimit: subscription.limits.totalFiles === -1 ? "Unlimited" : subscription.limits.totalFiles,
            plan: planDisplay,
            planId: subscription.plan,
            status: subscription.status,
            isActive: subscription.isActive,
            validUntil,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            isDevMode: subscription.isDevMode,
            features: subscription.limits.features,
            aiUsage: {
                queriesUsed: aiUsage.queryCount,
                queriesLimit: aiUsage.quota === -1 ? "Unlimited" : aiUsage.quota,
                tokensUsed: aiUsage.tokenCount,
                tokensLimit: aiUsage.tokenQuota === -1 ? "Unlimited" : aiUsage.tokenQuota,
                hasBringYourOwnKey: aiUsage.hasApiKey,
                billingMode: aiUsage.hasApiKey ? "bring_your_own_key" : "included_plan_allowance",
            },
            canUpgrade: subscription.plan !== "team",
            upgradePlan: subscription.plan === "free" ? "starter" : subscription.plan === "starter" ? "pro" : "team",
        }, {
            headers: {
                "Cache-Control": "private, max-age=60, stale-while-revalidate=300"
            }
        });
    } catch (error) {
        return errorResponse(error);
    }
}
