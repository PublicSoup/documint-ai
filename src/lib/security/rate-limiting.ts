import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/**
 * RATE LIMITING PATTERN
 * Implements sliding window rate limiting using Upstash Redis.
 */
const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "10 s"),
    analytics: true,
    prefix: "@documint/ratelimit",
});

export async function checkRateLimit(userId: string): Promise<boolean> {
    const { success } = await ratelimit.limit(userId);
    return success;
}

export async function getRateLimitInfo(userId: string) {
    return await ratelimit.limit(userId);
}
