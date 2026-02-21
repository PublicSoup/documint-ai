import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Lightweight edge middleware:
 * - Applies security headers
 * - Protects /admin routes
 *
 * API rate limiting is handled at route level to avoid duplicate network calls
 * and reduce request latency.
 */
export async function middleware(request: NextRequest) {
    const response = NextResponse.next();
    const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "127.0.0.1";

    if (request.nextUrl.pathname.startsWith("/admin")) {
        const token = await getToken({ req: request });
        const adminEmail = process.env.ADMIN_EMAIL || "admin@documintai.dev";

        const isEnvAdmin = token?.email === adminEmail;
        const isDbAdmin = token?.role === "ADMIN";

        if (!token || (!isEnvAdmin && !isDbAdmin)) {
            console.warn(`Unauthorized access attempt to ${request.nextUrl.pathname} from ${ip}`);
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

    const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com https://js.stripe.com https://cdn.jsdelivr.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
    img-src 'self' blob: data: https:;
    font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net;
    connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://*.auth0.com https://api.stripe.com https://checkout.stripe.com https://vitals.vercel-insights.com;
    frame-src 'self' https://*.auth0.com https://checkout.stripe.com https://js.stripe.com https://stackblitz.com;
    worker-src 'self' blob:;
    frame-ancestors 'self';
  `
        .replace(/\s{2,}/g, " ")
        .trim();

    response.headers.set("Content-Security-Policy", csp);

    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
