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
            `You've used ${usage.queryCount - 1} of ${limits.aiQueries} AI queries this month. Upgrade your plan or add your own API key to continue using the AI agent.`,
            { current: usage.queryCount - 1, limit: limits.aiQueries, limitType: "query" }
        );
    }

    if (limits.aiTokenAllowance !== -1 && usage.tokenCount > limits.aiTokenAllowance) {
        throw new AiQuotaExceededError(
            `You've used your included AI token allowance for this month. Upgrade your plan or add your own API key to continue using the AI agent.`,
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
            `You've used ${currentQueries} of ${limits.aiQueries} AI queries this month. Upgrade your plan or add your own API key to continue using the AI agent.`,
            { current: currentQueries, limit: limits.aiQueries, limitType: "query" }
        );
    }

    if (limits.aiTokenAllowance !== -1 && currentTokens + reservedTokens > limits.aiTokenAllowance) {
        throw new AiQuotaExceededError(
            `This request may exceed your included AI token allowance. Upgrade your plan, shorten the prompt, or add your own API key to continue.`,
            { current: currentTokens, limit: limits.aiTokenAllowance, limitType: "token" }
        );
    }
}

/**
 * Providers a user can bring their own API key for.
 * "custom" is any OpenAI-compatible endpoint; its stored value is a JSON
 * config ({ apiKey, baseUrl, modelId }) rather than a bare key.
 */
export const AI_KEY_PROVIDERS = ["google", "anthropic", "openai", "xai", "deepseek", "custom"] as const;
export type AiKeyProvider = (typeof AI_KEY_PROVIDERS)[number];

export type UserApiKeys = Partial<Record<AiKeyProvider, string>>;

export interface CustomProviderConfig {
    apiKey: string;
    baseUrl: string;
    modelId: string;
}

/**
 * Parse the stored value for the "custom" provider into a config object.
 * Returns null when the value is missing or malformed.
 */
export function parseCustomProviderConfig(value: string | undefined): CustomProviderConfig | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        if (
            typeof parsed.apiKey === "string" && parsed.apiKey.length > 0 &&
            typeof parsed.baseUrl === "string" && parsed.baseUrl.length > 0 &&
            typeof parsed.modelId === "string" && parsed.modelId.length > 0
        ) {
            return { apiKey: parsed.apiKey, baseUrl: parsed.baseUrl, modelId: parsed.modelId };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * The encrypted column historically held a single raw Google key. It now holds
 * a JSON object keyed by provider; a decrypted value that isn't JSON is treated
 * as a legacy Google key.
 */
function parseStoredKeys(decrypted: string): UserApiKeys {
    if (decrypted.startsWith("{")) {
        try {
            const parsed = JSON.parse(decrypted) as Record<string, unknown>;
            const keys: UserApiKeys = {};
            for (const provider of AI_KEY_PROVIDERS) {
                const value = parsed[provider];
                if (typeof value === "string" && value.length > 0) {
                    keys[provider] = value;
                }
            }
            return keys;
        } catch {
            return {};
        }
    }
    return { google: decrypted };
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
    providers: Record<AiKeyProvider, boolean>;
}> {
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const [usage, keys, { limits }] = await Promise.all([
        db.aiUsage.findUnique({
            where: { userId_month: { userId, month } },
        }),
        getUserApiKeys(userId),
        getUserSubscription(userId),
    ]);

    return {
        queryCount: usage?.queryCount ?? 0,
        tokenCount: usage?.tokenCount ?? 0,
        quota: limits.aiQueries,
        tokenQuota: limits.aiTokenAllowance,
        hasApiKey: Object.keys(keys).length > 0,
        providers: Object.fromEntries(
            AI_KEY_PROVIDERS.map(provider => [provider, !!keys[provider]])
        ) as Record<AiKeyProvider, boolean>,
    };
}

/**
 * Get all of the user's stored API keys, decrypted.
 */
export async function getUserApiKeys(userId: string): Promise<UserApiKeys> {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { encryptedApiKey: true },
    });

    if (!user?.encryptedApiKey) return {};

    try {
        return parseStoredKeys(decrypt(user.encryptedApiKey));
    } catch {
        // If decryption fails, the stored value is corrupted — clear it
        await db.user.update({
            where: { id: userId },
            data: { encryptedApiKey: null },
        });
        return {};
    }
}

/**
 * Check if the user has a stored API key for a provider and return it decrypted.
 * Returns null if no key is stored.
 */
export async function getUserApiKey(
    userId: string,
    provider: AiKeyProvider = "google"
): Promise<string | null> {
    const keys = await getUserApiKeys(userId);
    return keys[provider] ?? null;
}

/**
 * Store one of the user's API keys, encrypted at rest alongside any others.
 */
export async function saveUserApiKey(
    userId: string,
    provider: AiKeyProvider,
    apiKey: string
): Promise<void> {
    const keys = await getUserApiKeys(userId);
    keys[provider] = apiKey;
    await db.user.update({
        where: { id: userId },
        data: { encryptedApiKey: encrypt(JSON.stringify(keys)) },
    });
}

/**
 * Remove one of the user's API keys, or all of them when no provider is given.
 */
export async function deleteUserApiKey(
    userId: string,
    provider?: AiKeyProvider
): Promise<void> {
    if (provider) {
        const keys = await getUserApiKeys(userId);
        delete keys[provider];
        await db.user.update({
            where: { id: userId },
            data: {
                encryptedApiKey: Object.keys(keys).length > 0
                    ? encrypt(JSON.stringify(keys))
                    : null,
            },
        });
        return;
    }

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