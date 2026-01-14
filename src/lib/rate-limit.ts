import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Initialize Redis client (falls back to in-memory for dev)
const redis = process.env.UPSTASH_REDIS_REST_URL
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!
    })
    : null;

// Rate limiters for different tiers
const limiters = {
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
    }) : null
};

export async function rateLimit(
    identifier: string,
    tier: "free" | "pro" | "api" = "api"
): Promise<{ success: boolean; remaining: number; reset: number } | null> {
    // Development mode exemption
    if (process.env.NODE_ENV === "development" || !redis) {
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

export function rateLimitResponse(remaining: number, reset: number) {
    return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
            status: 429,
            headers: {
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString()
            }
        }
    );
}

// Helpers for API routes
export function getClientIP(req: Request): string {
    const xForwardedFor = req.headers.get("x-forwarded-for");
    if (xForwardedFor) {
        return xForwardedFor.split(",")[0].trim();
    }
    return "127.0.0.1";
}

export async function validateApiKey(apiKey: string): Promise<string | null> {
    // STARTUP-TIER: Simple environment variable check or TODO
    // In production, check against DB model ApiKey
    if (process.env.ADMIN_API_KEY && apiKey === process.env.ADMIN_API_KEY) {
        return "admin-user";
    }
    return null;
}
