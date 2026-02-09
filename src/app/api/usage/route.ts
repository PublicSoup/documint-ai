import { getUserSubscription } from "@/lib/subscription";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guards";
import { errorResponse, successResponse } from "@/lib/api-utils";

export async function GET() {
    try {
        const user = await requireAuth();

        // Get user's subscription
        const subscription = await getUserSubscription(user.id);

        // Get user's file count for this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const filesThisMonth = await db.file.count({
            where: {
                userId: user.id,
                createdAt: { gte: startOfMonth },
            },
        });

        // Get total files
        const totalFiles = await db.file.count({
            where: { userId: user.id },
        });

        // Calculate valid until date
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

        // Format plan name for display
        const planDisplay = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);

        return successResponse({
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
        console.error("Usage API Error:", error);
        // Return a valid empty structure so UI doesn't break
        return successResponse({
            filesProcessed: 0,
            filesLimit: 10,
            totalFiles: 0,
            totalFilesLimit: 100,
            plan: "Free",
            planId: "free",
            status: "active",
            isActive: true,
            validUntil: "Forever",
            cancelAtPeriodEnd: false,
            isDevMode: false,
            features: [],
            canUpgrade: true,
            upgradePlan: "starter"
        });
    }
}
