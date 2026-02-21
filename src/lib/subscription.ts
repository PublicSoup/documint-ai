import { db } from "./db";
import { env } from "./env";

export type PlanType = "free" | "starter" | "pro" | "team";

export interface SubscriptionInfo {
    plan: PlanType;
    status: string;
    isActive: boolean;
    isPro: boolean;
    isTeam: boolean;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    limits: PlanLimits;
    isDevMode?: boolean;
}

export interface PlanLimits {
    filesPerMonth: number;
    totalFiles: number;
    teamMembers: number;
    features: {
        analytics: boolean;
        changelog: boolean;
        smartSuggestions: boolean;
        auditLog: boolean;
        customTemplates: boolean;
        prioritySupport: boolean;
        diagramGenerator: boolean;
        rulesetGenerator: boolean;
        aiArchitect: boolean;
        codeExplain: boolean;
    };
}

const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
    free: {
        filesPerMonth: 10,
        totalFiles: 25,
        teamMembers: 1,
        features: {
            analytics: false,
            changelog: false,
            smartSuggestions: false,
            auditLog: false,
            customTemplates: false,
            prioritySupport: false,
            diagramGenerator: false,
            rulesetGenerator: false,
            aiArchitect: false,
            codeExplain: false,
        },
    },
    starter: {
        filesPerMonth: 100,
        totalFiles: 250,
        teamMembers: 3,
        features: {
            analytics: true,
            changelog: true,
            smartSuggestions: true,
            auditLog: false,
            customTemplates: false,
            prioritySupport: false,
            diagramGenerator: false,
            rulesetGenerator: true,
            aiArchitect: true,
            codeExplain: true,
        },
    },
    pro: {
        filesPerMonth: 500,
        totalFiles: -1, // Unlimited
        teamMembers: 10,
        features: {
            analytics: true,
            changelog: true,
            smartSuggestions: true,
            auditLog: true,
            customTemplates: true,
            prioritySupport: true,
            diagramGenerator: true,
            rulesetGenerator: true,
            aiArchitect: true,
            codeExplain: true,
        },
    },
    team: {
        filesPerMonth: -1, // Unlimited
        totalFiles: -1, // Unlimited
        teamMembers: -1, // Unlimited
        features: {
            analytics: true,
            changelog: true,
            smartSuggestions: true,
            auditLog: true,
            customTemplates: true,
            prioritySupport: true,
            diagramGenerator: true,
            rulesetGenerator: true,
            aiArchitect: true,
            codeExplain: true,
        },
    },
};

/**
 * Get user's subscription info with plan limits
 */
export async function getUserSubscription(userId: string): Promise<SubscriptionInfo> {
    const subscription = await db.subscription.findUnique({
        where: { userId },
    });

    if (!subscription) {
        return {
            plan: "free",
            status: "none",
            isActive: false,
            isPro: false,
            isTeam: false,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            limits: PLAN_LIMITS.free,
        };
    }

    const plan = (subscription.plan as PlanType) || "free";
    const isActive = ["active", "trialing"].includes(subscription.status);

    // TEMPORARY BYPASS FOR VERIFICATION
    return {
        plan,
        status: subscription.status,
        isActive,
        isPro: (plan === "pro" || plan === "team") && isActive,
        isTeam: plan === "team" && isActive,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free,
    };
}

/**
 * Check if user has access to a specific feature
 */
export async function hasFeatureAccess(
    userId: string,
    feature: keyof PlanLimits["features"]
): Promise<boolean> {
    const { limits } = await getUserSubscription(userId);
    return limits.features[feature];
}

/**
 * Check if user can upload more files
 */
export async function canUploadFile(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { limits, plan } = await getUserSubscription(userId);

    // Count files this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const filesThisMonth = await db.file.count({
        where: {
            userId,
            createdAt: { gte: startOfMonth },
        },
    });

    if (limits.filesPerMonth !== -1 && filesThisMonth >= limits.filesPerMonth) {
        return {
            allowed: false,
            reason: `Monthly limit reached (${limits.filesPerMonth} files). Upgrade to ${plan === "free" ? "Starter" : "Pro"} for more.`,
        };
    }

    // Check total files
    if (limits.totalFiles !== -1) {
        const totalFiles = await db.file.count({ where: { userId } });
        if (totalFiles >= limits.totalFiles) {
            return {
                allowed: false,
                reason: `Total file limit reached (${limits.totalFiles} files). Upgrade to ${plan === "starter" ? "Pro" : "Starter"} for more.`,
            };
        }
    }

    return { allowed: true };
}

/**
 * Create or update subscription from Stripe webhook
 */
export async function upsertSubscription(data: {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    status: string;
    plan: PlanType;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    trialEnd?: Date | null;
}) {
    return db.subscription.upsert({
        where: { userId: data.userId },
        create: data,
        update: {
            stripeCustomerId: data.stripeCustomerId,
            stripeSubscriptionId: data.stripeSubscriptionId,
            stripePriceId: data.stripePriceId,
            status: data.status,
            plan: data.plan,
            currentPeriodStart: data.currentPeriodStart,
            currentPeriodEnd: data.currentPeriodEnd,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd,
            trialEnd: data.trialEnd,
        },
    });
}

/**
 * Mark subscription as canceled
 */
export async function cancelSubscription(stripeSubscriptionId: string) {
    return db.subscription.updateMany({
        where: { stripeSubscriptionId },
        data: { status: "canceled" },
    });
}

/**
 * Get plan limits for a specific plan
 */
export function getPlanLimits(plan: PlanType): PlanLimits {
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Map Stripe price ID to plan name
 */
export function getPlanFromPriceId(priceId: string): PlanType {
    const priceMap: Record<string, PlanType> = {};

    if (env.STRIPE_PRICE_ID_STARTER) priceMap[env.STRIPE_PRICE_ID_STARTER] = "starter";
    if (env.STRIPE_PRICE_ID_PRO) priceMap[env.STRIPE_PRICE_ID_PRO] = "pro";
    if (env.STRIPE_PRICE_ID_TEAM) priceMap[env.STRIPE_PRICE_ID_TEAM] = "team";

    return priceMap[priceId] || "free";
}
