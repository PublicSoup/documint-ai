import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { isIP } from "node:net";
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
    // Authentication endpoints (login, register) by IP - 10 per 5 minutes
    "auth-ip": redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "rl:auth-ip"
    }) : null,

    // Authentication endpoints (login, register) - 5 per 15 minutes
    auth: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: "rl:auth"
    }) : null,

    // Chat tier: 15 calls per minute
    chat: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(15, "1 m"),
        prefix: "rl:chat"
    }) : null,

    // Pro tier: 500 AI calls per minute
    pro: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(500, "1 m"),
        prefix: "rl:pro"
    }) : null,

    // High security: 10 attempts per 30 minutes (relaxed for better UX)
    security: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "30 m"),
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
    }) : null,

    // File creations: 10 per minute
    file_create: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "rl:file_create"
    }) : null,

    // File deletions: 10 per 5 minutes
    file_delete: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "rl:file_delete"
    }) : null,

    // File renames: 10 per 5 minutes
    file_rename: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "5 m"),
        prefix: "rl:file_rename"
    }) : null,
    // Bulk file creations: 5 per minute
    file_create_bulk: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "1 m"),
        prefix: "rl:file_create_bulk"
    }) : null,

    // AI Architect: 10 calls per hour
    architect: redis ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 h"),
        prefix: "rl:architect"
    }) : null,
};

type RateLimitTier = "auth" | "auth-ip" | "pro" | "api" | "upload" | "security" | "file_create" | "file_delete" | "file_rename" | "file_create_bulk" | "architect" | "chat";

const fallbackLimits: Record<RateLimitTier, { requests: number; windowMs: number }> = {
    auth: { requests: 5, windowMs: 15 * 60 * 1000 },
    "auth-ip": { requests: 10, windowMs: 5 * 60 * 1000 },
    chat: { requests: 15, windowMs: 60 * 1000 },
    pro: { requests: 500, windowMs: 60 * 1000 },
    security: { requests: 10, windowMs: 30 * 60 * 1000 },
    api: { requests: 300, windowMs: 60 * 1000 },
    upload: { requests: 10, windowMs: 60 * 1000 },
    file_create: { requests: 10, windowMs: 60 * 1000 },
    file_delete: { requests: 10, windowMs: 5 * 60 * 1000 },
    file_rename: { requests: 10, windowMs: 5 * 60 * 1000 },
    file_create_bulk: { requests: 5, windowMs: 60 * 1000 },
    architect: { requests: 10, windowMs: 60 * 60 * 1000 },
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
        throw ApiErrors.tooManyRequests(
            `Rate limit exceeded. Please try again in ${waitTime} minute${waitTime !== 1 ? 's' : ''}.`
        );
    }
}

export function rateLimitResponse(remaining: number, reset: number) {
    const retryAfterSeconds = Math.max(0, Math.ceil(reset - Date.now() / 1000));

    return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
            status: 429,
            headers: {
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString(),
                "Retry-After": retryAfterSeconds.toString()
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

    const ipVersion = isIP(candidate);
    if (ipVersion === 4 || ipVersion === 6) {
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
        } catch (error: unknown) {
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
        } catch (error: unknown) {
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
    } catch (error: unknown) {
        // Log the error but do NOT fetch all users (OOM risk)
        console.error("[RateLimit] API key lookup failed:", error);
        return null;
    }
}
