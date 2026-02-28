import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { env } from "./env";
import { ApiErrors } from "./api-utils";
import { db } from "./db";

// Initialize Redis client (falls back to null for dev/when not configured)
const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN
    })
    : null;

// Rate limiters for different tiers and endpoints
const limiters = {
    // Authentication endpoints (login, register) - 5 per 15 minutes
    auth: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: "rl:auth"
    }) : null,

    // Free tier: 100 AI calls per minute
    free: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, "1 m"),
        prefix: "rl:free"
    }) : null,

    // Pro tier: 500 AI calls per minute
    pro: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(500, "1 m"),
        prefix: "rl:pro"
    }) : null,

    // High security: 5 attempts per hour (for specific users/emails)
    security: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "1 h"),
        prefix: "rl:sec"
    }) : null,

    // General API: 300 requests per minute
    api: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(300, "1 m"),
        prefix: "rl:api"
    }) : null,

    // File uploads: 10 per minute
    upload: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "rl:upload"
    }) : null
};

type RateLimitTier = "auth" | "free" | "pro" | "api" | "upload" | "security";

const fallbackLimits: Record<RateLimitTier, { requests: number; windowMs: number }> = {
    auth: { requests: 5, windowMs: 15 * 60 * 1000 },
    free: { requests: 100, windowMs: 60 * 1000 },
    pro: { requests: 500, windowMs: 60 * 1000 },
    security: { requests: 5, windowMs: 60 * 60 * 1000 },
    api: { requests: 300, windowMs: 60 * 1000 },
    upload: { requests: 10, windowMs: 60 * 1000 }
};

const memoryFallbackStore = new Map<string, { count: number; windowStart: number }>();

function fallbackRateLimit(identifier: string, tier: RateLimitTier): { success: boolean; remaining: number; reset: number } {
    const now = Date.now();
    const { requests, windowMs } = fallbackLimits[tier];
    const key = `${tier}:${identifier}`;

    const current = memoryFallbackStore.get(key);
    const withinWindow = current && now - current.windowStart < windowMs;

    if (!withinWindow) {
        memoryFallbackStore.set(key, { count: 1, windowStart: now });
        return {
            success: true,
            remaining: requests - 1,
            reset: Math.ceil((now + windowMs) / 1000)
        };
    }

    const nextCount = current.count + 1;
    current.count = nextCount;

    // Opportunistic cleanup to prevent unbounded growth
    if (memoryFallbackStore.size > 10_000) {
        for (const [storeKey, value] of memoryFallbackStore.entries()) {
            const [storedTier] = storeKey.split(":") as [RateLimitTier, string];
            const ttlMs = fallbackLimits[storedTier]?.windowMs ?? 60 * 1000;
            if (now - value.windowStart >= ttlMs) {
                memoryFallbackStore.delete(storeKey);
            }
        }
    }

    return {
        success: nextCount <= requests,
        remaining: Math.max(requests - nextCount, 0),
        reset: Math.ceil((current.windowStart + windowMs) / 1000)
    };
}

export async function rateLimit(
    identifier: string,
    tier: RateLimitTier = "api"
): Promise<{ success: boolean; remaining: number; reset: number } | null> {
    if (env.NODE_ENV === "development") {
        console.log(`[RateLimit] Dev mode - bypassing ${tier} limit for ${identifier}`);
        return { success: true, remaining: 9999, reset: 0 };
    }

    if (!redis) {
        console.warn(`[RateLimit] Redis unavailable in ${env.NODE_ENV}; using in-memory fallback for ${tier}`);
        return fallbackRateLimit(identifier, tier);
    }

    const limiter = limiters[tier];
    if (!limiter) {
        return fallbackRateLimit(identifier, tier);
    }

    const result = await limiter.limit(identifier);
    return {
        success: result.success,
        remaining: result.remaining,
        reset: result.reset
    };
}

/**
 * Enforce rate limit - throws ApiException if exceeded
 */
export async function enforceRateLimit(
    identifier: string,
    tier: RateLimitTier = "api"
): Promise<void> {
    const result = await rateLimit(identifier, tier);

    if (result && !result.success) {
        const waitTime = Math.ceil((result.reset - Date.now() / 1000) / 60);
        throw ApiErrors.serviceUnavailable(
            `Rate limit exceeded. Please try again in ${waitTime} minute${waitTime !== 1 ? 's' : ''}.`
        );
    }
}

export function rateLimitResponse(remaining: number, reset: number) {
    return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
            status: 429,
            headers: {
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString(),
                "Retry-After": Math.ceil((reset - Date.now() / 1000)).toString()
            }
        }
    );
}

// Helpers for API routes
function normalizeClientIp(raw: string | null): string | null {
    if (!raw) {
        return null;
    }

    const candidate = raw.split(",")[0]?.trim().slice(0, 64);

    if (!candidate) {
        return null;
    }

    const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^[0-9a-fA-F:]+$/;

    if (ipv4Pattern.test(candidate) || ipv6Pattern.test(candidate)) {
        return candidate;
    }

    return null;
}

export async function getClientIP(req?: Request): Promise<string> {
    let headersList: Headers | undefined;

    if (req) {
        headersList = req.headers as Headers;
    } else {
        try {
            // Try to use next/headers if called in a request context
            headersList = await nextHeaders();
        } catch {
            // Not in a request context or headers() failed
            return "127.0.0.1";
        }
    }

    if (!headersList) return "127.0.0.1";

    const cfConnectingIp = normalizeClientIp(headersList.get("cf-connecting-ip")); // Cloudflare
    const xRealIp = normalizeClientIp(headersList.get("x-real-ip"));
    const xForwardedFor = normalizeClientIp(headersList.get("x-forwarded-for"));

    if (cfConnectingIp) return cfConnectingIp;
    if (xRealIp) return xRealIp;
    if (xForwardedFor) return xForwardedFor;

    return "127.0.0.1";
}

export async function getUserAgent(req?: Request): Promise<string> {
    let headersList: Headers | undefined;

    if (req) {
        headersList = req.headers as Headers;
    } else {
        try {
            headersList = await nextHeaders();
        } catch {
            return "unknown";
        }
    }

    return headersList?.get("user-agent") || "unknown";
}

export async function validateApiKey(apiKey: string): Promise<string | null> {
    if (!apiKey) return null;

    // 1. Check Admin Key (Env)
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && apiKey === adminKey) {
        return "admin-user";
    }

    // 2. Check Database for User Key
    try {
        const user = await db.user.findFirst({
            where: {
                settings: {
                    path: ['apiKey'],
                    equals: apiKey
                }
            },
            select: { id: true }
        });

        return user?.id || null;
    } catch {
        // Fallback: manual scan if json search fails
        // This is slow but works as a last resort
        const users = await db.user.findMany({
            select: { id: true, settings: true }
        });

        for (const u of users) {
            const settings = u.settings as { apiKey?: string } | null;
            if (settings?.apiKey === apiKey) {
                return u.id;
            }
        }
    }

    return null;
}
