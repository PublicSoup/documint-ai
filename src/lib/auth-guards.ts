import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { ApiErrors } from "./api-utils";
import { db } from "./db";

/**
 * Session user type with required ID
 */
export interface AuthenticatedUser {
    id: string;
    email: string | null;
    name?: string | null;
    image?: string | null;
}

/**
 * Get authenticated user from session
 * Throws ApiException if not authenticated
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        throw ApiErrors.unauthorized("Authentication required");
    }

    return {
        id: session.user.id,
        email: session.user.email || null,
        name: session.user.name,
        image: session.user.image,
    };
}

/**
 * Get optional authenticated user (returns null if not authenticated)
 */
export async function getAuthUser(): Promise<AuthenticatedUser | null> {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return null;
    }

    return {
        id: session.user.id,
        email: session.user.email || null,
        name: session.user.name,
        image: session.user.image,
    };
}

/**
 * Require user to have a specific subscription plan
 */
export async function requirePlan(userId: string, allowedPlans: string[]): Promise<void> {
    const subscription = await db.subscription.findUnique({
        where: { userId },
    });

    if (!subscription || !allowedPlans.includes(subscription.plan)) {
        throw ApiErrors.forbidden(`This feature requires a ${allowedPlans.join(" or ")} plan`);
    }
}

/**
 * Check if user owns a resource
 */
export async function requireOwnership(userId: string, resourceUserId: string | null): Promise<void> {
    if (userId !== resourceUserId) {
        throw ApiErrors.forbidden("You do not have permission to access this resource");
    }
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    identifier: string;
}

// Simple in-memory rate limiter (use Redis/Upstash in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<void> {
    const key = `ratelimit:${config.identifier}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
        rateLimitStore.set(key, {
            count: 1,
            resetAt: now + config.windowMs,
        });
        return;
    }

    if (record.count >= config.maxRequests) {
        throw ApiErrors.serviceUnavailable("Rate limit exceeded. Please try again later.");
    }

    record.count++;
}

/**
 * Extract IP address from request
 */
export function getIpAddress(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0] ||
        request.headers.get("x-real-ip") ||
        "unknown"
    );
}
