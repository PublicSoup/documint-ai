import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const publicPaths = [
    "/auth/login",
    "/auth/register",
    "/api/auth",
    "/api/v1/analyze",
    "/api/webhooks",
    "/api/health",
    "/_next",
    "/favicon.ico",
    "/public",
    "/og-image.png",
];

/**
 * Lightweight edge middleware:
 * - Applies security headers
 * - Protects /admin routes
 *
 * API rate limiting is handled at route level to avoid duplicate network calls
 * and reduce request latency.
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const response = NextResponse.next();

    if (publicPaths.some(path => pathname.startsWith(path)) || pathname === "/") {
        return response;
    }

    const isAdmin = pathname.startsWith("/admin");
    const isDashboard = pathname.startsWith("/dashboard");
    const isCode = pathname.startsWith("/code");
    const isProtectedApi = pathname.startsWith("/api/") && !publicPaths.some(path => pathname.startsWith(path));

    if (isAdmin || isDashboard || isCode || isProtectedApi) {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

        if (!token) {
            if (isProtectedApi) {
                return NextResponse.json(
                    { success: false, error: "Authentication required" },
                    { status: 401 }
                );
            }

            const url = new URL("/auth/login", request.url);
            url.searchParams.set("callbackUrl", encodeURI(request.url));
            return NextResponse.redirect(url);
        }
    }

    if (isAdmin) {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        const adminEmail = process.env.ADMIN_EMAIL || "admin@documintai.dev";

        const isEnvAdmin = token?.email === adminEmail;
        const isDbAdmin = token?.role === "ADMIN";

        if (!token || (!isEnvAdmin && !isDbAdmin)) {
            const redirectResponse = NextResponse.redirect(new URL("/", request.url));
            redirectResponse.headers.set("x-documint-security-event", "admin-authz-denied");
            return redirectResponse;
        }
    }

    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (!isCode) {
        response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
        response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    }
    if (!isCode) {
        response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    }
    response.headers.set("Origin-Agent-Cluster", "?1");

    const csp = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://va.vercel-scripts.com https://js.stripe.com https://cdn.jsdelivr.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
    img-src 'self' blob: data: https:;
    font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net;
    connect-src 'self' blob: ws: wss: https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://*.auth0.com https://api.stripe.com https://checkout.stripe.com https://vitals.vercel-insights.com;
    frame-src 'self' blob: https://*.auth0.com https://checkout.stripe.com https://js.stripe.com https://stackblitz.com;
    worker-src 'self' blob:;
    frame-ancestors 'self';
  `
        .replace(/\s{2,}/g, " ")
        .trim();

    response.headers.set("Content-Security-Policy", csp);

    return response;
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|public/).*)"],
};
