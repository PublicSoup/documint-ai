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

    // Check plan quota for shared key usage
    const { limits } = await getUserSubscription(userId);

    if (limits.aiQueries !== -1 && usage.queryCount > limits.aiQueries) {
        throw new AiQuotaExceededError(
            `You've used ${usage.queryCount - 1} of ${limits.aiQueries} AI queries this month. Upgrade your plan or add your own Google API key to continue using the AI agent.`,
            { queryCount: usage.queryCount - 1, limit: limits.aiQueries }
        );
    }

    return {
        queryCount: usage.queryCount,
        tokenCount: usage.tokenCount,
        remainingQueries: limits.aiQueries === -1 ? -1 : Math.max(0, limits.aiQueries - usage.queryCount),
    };
}

/**
 * Get the user's AI usage stats for the current month.
 */
export async function getUserAiUsage(userId: string): Promise<{
    queryCount: number;
    tokenCount: number;
    quota: number;
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
    public readonly queryCount: number;
    public readonly limit: number;

    constructor(message: string, details: { queryCount: number; limit: number }) {
        super(message);
        this.name = "AiQuotaExceededError";
        this.queryCount = details.queryCount;
        this.limit = details.limit;
    }
}