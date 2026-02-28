import { NextResponse } from "next/server";
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
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const subscription = await getUserSubscription(session.user.id);

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
            }),
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
            canUpgrade: subscription.plan !== "team",
            upgradePlan: subscription.plan === "free" ? "starter" : subscription.plan === "starter" ? "pro" : "team",
        });
    } catch (error) {
        return errorResponse(error);
    }
}
