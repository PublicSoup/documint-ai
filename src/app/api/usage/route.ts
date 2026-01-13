import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { db } from "../../../lib/db";
import { getUserSubscription } from "@/lib/subscription";

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get user's subscription
        const subscription = await getUserSubscription(session.user.id);

        // Get user's file count for this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const filesThisMonth = await db.file.count({
            where: {
                userId: session.user.id,
                createdAt: { gte: startOfMonth },
            },
        });

        // Get total files
        const totalFiles = await db.file.count({
            where: { userId: session.user.id },
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

            // Feature access
            features: subscription.limits.features,

            // Upgrade info
            canUpgrade: subscription.plan !== "team",
            upgradePlan: subscription.plan === "free" ? "starter" : subscription.plan === "starter" ? "pro" : "team",
        });
    } catch (error) {
        console.error("Usage error:", error);
        return NextResponse.json(
            { error: "Failed to fetch usage data" },
            { status: 500 }
        );
    }
}
