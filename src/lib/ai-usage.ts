import { db } from "./db";
import { getUserSubscription } from "./subscription";
import { encrypt, decrypt } from "./security/encryption";

/**
 * Track an AI query for a specific user.
 * Increments queryCount and tokenCount for the current billing month.
 * Throws if the user has exceeded their plan's AI allowance (shared key mode only).
 */
export async function trackAiUsage(
    userId: string,
    tokens: number,
    options?: { isUsingOwnKey?: boolean }
): Promise<{ queryCount: number; tokenCount: number; remainingQueries: number }> {
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    // Upsert the monthly usage row atomically
    const usage = await db.aiUsage.upsert({
        where: { userId_month: { userId, month } },
        create: { userId, month, queryCount: 1, tokenCount: tokens },
        update: {
            queryCount: { increment: 1 },
            tokenCount: { increment: tokens },
        },
    });

    // If user is using their own API key, no quota enforcement needed
    if (options?.isUsingOwnKey) {
        return {
            queryCount: usage.queryCount,
            tokenCount: usage.tokenCount,
            remainingQueries: -1, // Unlimited when using own key
        };
    }

    // Check plan quota for shared key usage. Preflight checks should prevent this path,
    // but this remains as defense-in-depth for concurrent requests and legacy callers.
    const { limits } = await getUserSubscription(userId);

    if (limits.aiQueries !== -1 && usage.queryCount > limits.aiQueries) {
        throw new AiQuotaExceededError(
            `You've used ${usage.queryCount - 1} of ${limits.aiQueries} AI queries this month. Upgrade your plan or add your own Google API key to continue using the AI agent.`,
            { current: usage.queryCount - 1, limit: limits.aiQueries, limitType: "query" }
        );
    }

    if (limits.aiTokenAllowance !== -1 && usage.tokenCount > limits.aiTokenAllowance) {
        throw new AiQuotaExceededError(
            `You've used your included AI token allowance for this month. Upgrade your plan or add your own Google API key to continue using the AI agent.`,
            { current: usage.tokenCount - tokens, limit: limits.aiTokenAllowance, limitType: "token" }
        );
    }

    return {
        queryCount: usage.queryCount,
        tokenCount: usage.tokenCount,
        remainingQueries: limits.aiQueries === -1 ? -1 : Math.max(0, limits.aiQueries - usage.queryCount),
    };
}

/**
 * Preflight shared-key AI usage before a provider call is made.
 * This prevents the app from paying for AI requests that the user cannot afford under their plan.
 */
export async function assertAiUsageBudget(
    userId: string,
    reservedTokens: number,
    options?: { isUsingOwnKey?: boolean }
): Promise<void> {
    if (options?.isUsingOwnKey) return;

    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const [usage, { limits }] = await Promise.all([
        db.aiUsage.findUnique({
            where: { userId_month: { userId, month } },
            select: { queryCount: true, tokenCount: true },
        }),
        getUserSubscription(userId),
    ]);

    const currentQueries = usage?.queryCount ?? 0;
    const currentTokens = usage?.tokenCount ?? 0;

    if (limits.aiQueries !== -1 && currentQueries >= limits.aiQueries) {
        throw new AiQuotaExceededError(
            `You've used ${currentQueries} of ${limits.aiQueries} AI queries this month. Upgrade your plan or add your own Google API key to continue using the AI agent.`,
            { current: currentQueries, limit: limits.aiQueries, limitType: "query" }
        );
    }

    if (limits.aiTokenAllowance !== -1 && currentTokens + reservedTokens > limits.aiTokenAllowance) {
        throw new AiQuotaExceededError(
            `This request may exceed your included AI token allowance. Upgrade your plan, shorten the prompt, or add your own Google API key to continue.`,
            { current: currentTokens, limit: limits.aiTokenAllowance, limitType: "token" }
        );
    }
}

/**
 * Get the user's AI usage stats for the current month.
 */
export async function getUserAiUsage(userId: string): Promise<{
    queryCount: number;
    tokenCount: number;
    quota: number;
    tokenQuota: number;
    hasApiKey: boolean;
}> {
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const [usage, user, { limits }] = await Promise.all([
        db.aiUsage.findUnique({
            where: { userId_month: { userId, month } },
        }),
        db.user.findUnique({
            where: { id: userId },
            select: { encryptedApiKey: true },
        }),
        getUserSubscription(userId),
    ]);

    return {
        queryCount: usage?.queryCount ?? 0,
        tokenCount: usage?.tokenCount ?? 0,
        quota: limits.aiQueries,
        tokenQuota: limits.aiTokenAllowance,
        hasApiKey: !!user?.encryptedApiKey,
    };
}

/**
 * Check if the user has a stored API key and return it decrypted.
 * Returns null if no key is stored.
 */
export async function getUserApiKey(userId: string): Promise<string | null> {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { encryptedApiKey: true },
    });

    if (!user?.encryptedApiKey) return null;

    try {
        return decrypt(user.encryptedApiKey);
    } catch {
        // If decryption fails, the key is corrupted — clear it
        await db.user.update({
            where: { id: userId },
            data: { encryptedApiKey: null },
        });
        return null;
    }
}

/**
 * Store the user's API key, encrypted at rest.
 */
export async function saveUserApiKey(userId: string, apiKey: string): Promise<void> {
    const encrypted = encrypt(apiKey);
    await db.user.update({
        where: { id: userId },
        data: { encryptedApiKey: encrypted },
    });
}

/**
 * Remove the user's API key.
 */
export async function deleteUserApiKey(userId: string): Promise<void> {
    await db.user.update({
        where: { id: userId },
        data: { encryptedApiKey: null },
    });
}

/**
 * Custom error for AI quota exceeded scenarios.
 */
export class AiQuotaExceededError extends Error {
    public readonly current: number;
    public readonly queryCount: number;
    public readonly limit: number;
    public readonly limitType: "query" | "token";

    constructor(message: string, details: { current?: number; queryCount?: number; limit: number; limitType?: "query" | "token" }) {
        super(message);
        this.name = "AiQuotaExceededError";
        this.current = details.current ?? details.queryCount ?? 0;
        this.queryCount = details.queryCount ?? this.current;
        this.limit = details.limit;
        this.limitType = details.limitType ?? "query";
    }
}