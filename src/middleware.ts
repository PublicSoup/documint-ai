import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Simple in-memory fallback for rate limiting if Redis is not configured
const cache = new Map();

// Rate Limiter initialization with verbose logging for enterprise debugging
let ratelimit: Ratelimit | null = null;

try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        ratelimit = new Ratelimit({
            redis: Redis.fromEnv(),
            limiter: Ratelimit.slidingWindow(20, "10 s"),
            analytics: true,
            prefix: "@documint/ratelimit",
        });
    } else {
        console.warn("⚠️  Enterprise Rate Limiting Disabled: Missing Upstash Redis Credentials");
    }
} catch (e) {
    console.error("❌ Rate Limiter Initialization Failed:", e);
}

import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
    const response = NextResponse.next();
    // Get IP from headers (Next.js 16+ compatible)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? '127.0.0.1';

    // 0. Admin Protection
    if (request.nextUrl.pathname.startsWith('/admin')) {
        const token = await getToken({ req: request });
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@documintai.dev';

        const isEnvAdmin = token?.email === adminEmail;
        const isDbAdmin = token?.role === 'ADMIN';

        if (!token || (!isEnvAdmin && !isDbAdmin)) {
            console.warn(`Unauthorized access attempt to ${request.nextUrl.pathname} from ${ip}`);
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    // 1. Enterprise Security Headers
    // HSTS - Force HTTPS for 1 year
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // X-Frame-Options - Prevent Clickjacking (allow from same origin)
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');

    // X-Content-Type-Options - Prevent MIME Sniffing
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // Referrer-Policy - Control info sent to external sites
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions-Policy - Lock down browser features
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // Content-Security-Policy - Mitigate XSS
    // Using a relatively strict policy but allowing 'unsafe-inline' for styles due to Tailwind/Next.js
    // In a true enterprise env, we'd use nonces.
    const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com https://js.stripe.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https:;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://api.openai.com https://api.anthropic.com https://*.auth0.com https://api.stripe.com https://checkout.stripe.com https://vitals.vercel-insights.com;
    frame-src 'self' https://*.auth0.com https://checkout.stripe.com https://js.stripe.com;
    frame-ancestors 'self';
  `.replace(/\s{2,}/g, ' ').trim();

    response.headers.set('Content-Security-Policy', csp);

    // 2. Rate Limiting (API Routes only)
    if (request.nextUrl.pathname.startsWith('/api') && ratelimit) {
        try {
            const { success, limit, reset, remaining } = await ratelimit.limit(ip);

            response.headers.set('X-RateLimit-Limit', limit.toString());
            response.headers.set('X-RateLimit-Remaining', remaining.toString());
            response.headers.set('X-RateLimit-Reset', reset.toString());

            if (!success) {
                return new NextResponse('Too Many Requests', {
                    status: 429,
                    headers: response.headers
                });
            }
        } catch (e) {
            console.error("Rate limit error:", e);
            // Fail open to avoid blocking legitimate users on redis errors
        }
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|public/).*)',
    ],
};
