import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { coepForUserAgent } from "@/lib/coep";
import { translateBearerToSessionCookie } from "@/lib/mobile-auth";

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

// Paths the mobile bearer->session-cookie bridge (below) must never touch:
// NextAuth's own routes and the mobile auth-issuance routes are themselves
// the unauthenticated surface that *produces* tokens/cookies, and
// webhooks/health are unauthenticated by design. None of them ever read the
// session cookie the bridge exists to synthesize, so translating on these
// paths would only be dead work. Cross-reference
// `scripts/check-api-authz.mjs`'s EXEMPT_PATH_PARTS, which exempts the same
// routes from the "every route must check auth" lint for the same reason.
const MOBILE_AUTH_BRIDGE_EXEMPT_PATHS = [
    "/api/mobile/auth/",
    "/api/auth/",
    "/api/webhooks/",
    "/api/health",
];

// Expo's local web-preview dev servers only — used solely so this repo's own
// headless verification (`expo start --web`) can call the API cross-origin.
// The native iOS/Android app's `fetch` is never subject to browser CORS, so
// this allowlist has no effect on it, and it is intentionally disabled in
// production so it can never widen the API's real CORS surface.
const MOBILE_DEV_CORS_ORIGINS = new Set(["http://localhost:8081", "http://localhost:19006"]);

function withMobileDevCors(request: NextRequest, response: NextResponse): NextResponse {
    if (process.env.NODE_ENV === "production") return response;
    const origin = request.headers.get("origin");
    if (!origin || !MOBILE_DEV_CORS_ORIGINS.has(origin)) return response;

    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    return response;
}

/**
 * Handles every /api/** request. This is intentionally the *only* thing this
 * branch does — translate a mobile `Authorization: Bearer` token into the
 * NextAuth session cookie route handlers already expect (so none of the
 * ~113 routes calling `getServerSession(authOptions)` need to change), plus
 * the dev-only CORS reflection above. It must stay a strict no-op for every
 * existing browser request: no bearer header means nothing is translated,
 * and no security/CSP headers below are touched since those are page-only.
 */
async function handleApiRequest(request: NextRequest): Promise<NextResponse> {
    if (request.method === "OPTIONS") {
        return withMobileDevCors(request, new NextResponse(null, { status: 204 }));
    }

    const { pathname } = request.nextUrl;
    const isBridgeExempt = MOBILE_AUTH_BRIDGE_EXEMPT_PATHS.some((p) => pathname.startsWith(p));

    if (isBridgeExempt) {
        return withMobileDevCors(request, NextResponse.next());
    }

    const translatedCookie = await translateBearerToSessionCookie(request);
    if (!translatedCookie) {
        return withMobileDevCors(request, NextResponse.next());
    }

    const headers = new Headers(request.headers);
    const existingCookie = headers.get("cookie");
    headers.set("cookie", existingCookie ? `${existingCookie}; ${translatedCookie}` : translatedCookie);

    return withMobileDevCors(request, NextResponse.next({ request: { headers } }));
}

/**
 * Lightweight edge middleware:
 * - Bridges mobile bearer-token auth onto the NextAuth session cookie for /api/**
 * - Applies security headers
 * - Protects /admin routes
 *
 * API rate limiting is handled at route level to avoid duplicate network calls
 * and reduce request latency.
 */
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith("/api/")) {
        return handleApiRequest(request);
    }

    const response = NextResponse.next();

    if (publicPaths.some(path => pathname.startsWith(path)) || pathname === "/") {
        return response;
    }

    const isAdmin = pathname.startsWith("/admin");
    const isCode = pathname.startsWith("/code");

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
    // WebContainers require cross-origin isolation to access SharedArrayBuffer.
    // Only /code needs it, and the right COEP mode is browser-dependent:
    // Chromium/Firefox get `credentialless` (keeps the preview iframe embeddable),
    // Safari/WebKit get `require-corp` (the only mode they isolate under). The value
    // MUST match the `coep` option passed to WebContainer.boot() in
    // src/lib/web-container.ts. Non-/code pages keep `credentialless` (harmless —
    // Safari ignores it) so require-corp never blocks cross-origin iframes there.
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set(
        "Cross-Origin-Embedder-Policy",
        isCode ? coepForUserAgent(request.headers.get("user-agent")) : "credentialless",
    );
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    response.headers.set("Origin-Agent-Cluster", "?1");

    // Every origin @webcontainer/api loads from. The boot handshake loads a hidden
    // iframe from https://stackblitz.com/headless; the runtime and credentialless
    // preview servers load from *.staticblitz.com / *.webcontainer-api.io. If ANY of
    // these is missing from frame-src the boot iframe is silently blocked, the init
    // postMessage never arrives, and boot hangs until it times out as
    // WEBCONTAINER_BOOT_FAILED. Keep this list as the single source of truth so every
    // directive (frame-src/connect-src/script-src) stays in sync.
    const webContainerOrigins = [
        "https://stackblitz.com",
        "https://*.stackblitz.io",
        "https://staticblitz.com",
        "https://*.staticblitz.com",
        "https://*.webcontainer.io",
        "https://*.webcontainer-api.io",
        "https://*.local-credentialless.webcontainer.io",
    ].join(" ");

    const csp = (isCode ? `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://va.vercel-scripts.com https://cdn.jsdelivr.net ${webContainerOrigins};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
    img-src 'self' blob: data: https: http://localhost:*;
    font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net;
    connect-src 'self' blob: http://localhost:* ws: wss: https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://*.auth0.com https://api.stripe.com https://checkout.stripe.com https://vitals.vercel-insights.com ${webContainerOrigins};
    frame-src 'self' blob: http://localhost:* ${webContainerOrigins};
    worker-src 'self' blob:;
    frame-ancestors 'self';
  ` : `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://va.vercel-scripts.com https://js.stripe.com https://cdn.jsdelivr.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
    img-src 'self' blob: data: https:;
    font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net;
    connect-src 'self' blob: ws: wss: https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://*.auth0.com https://api.stripe.com https://checkout.stripe.com https://vitals.vercel-insights.com;
    frame-src 'self' blob: https://*.auth0.com https://checkout.stripe.com https://js.stripe.com https://stackblitz.com;
    worker-src 'self' blob:;
    frame-ancestors 'self';
  `)
        .replace(/[\r\n]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

    response.headers.set("Content-Security-Policy", csp);

    return response;
}

export const config = {
    // Now includes /api/** (previously excluded) solely so the mobile
    // bearer->cookie bridge in handleApiRequest() above can run; see that
    // function's docstring for why this is safe for existing browser traffic.
    matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
