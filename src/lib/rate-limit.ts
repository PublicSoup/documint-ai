import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { env } from "./env";
import { ApiErrors } from "./api-utils";

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

export async function rateLimit(
    identifier: string,
    tier: "auth" | "free" | "pro" | "api" | "upload" = "api"
): Promise<{ success: boolean; remaining: number; reset: number } | null> {
    // Development mode or no Redis - bypass limits
    if (env.NODE_ENV === "development" || !redis) {
        console.log(`[RateLimit] Dev mode - bypassing ${tier} limit for ${identifier}`);
        return { success: true, remaining: 9999, reset: 0 };
    }

    const limiter = limiters[tier];
    if (!limiter) {
        return { success: true, remaining: 9999, reset: 0 };
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
    tier: "auth" | "free" | "pro" | "api" | "upload" = "api"
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
export function getClientIP(req: Request): string {
    const xForwardedFor = req.headers.get("x-forwarded-for");
    const xRealIp = req.headers.get("x-real-ip");
    const cfConnectingIp = req.headers.get("cf-connecting-ip"); // Cloudflare

    if (cfConnectingIp) return cfConnectingIp;
    if (xRealIp) return xRealIp;
    if (xForwardedFor) return xForwardedFor.split(",")[0].trim();

    return "127.0.0.1";
}

export async function validateApiKey(apiKey: string): Promise<string | null> {
    // TODO: In production, check against DB model ApiKey
    // For now, basic admin key check
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && apiKey === adminKey) {
        return "admin-user";
    }
    return null;
}
