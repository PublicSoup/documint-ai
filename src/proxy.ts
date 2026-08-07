import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { coepForUserAgent } from "@/lib/coep";
import { isNativeUserAgent } from "@/lib/platform/server";

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
    const isCode = pathname.startsWith("/code");
    // The Capacitor native shell (iOS/Android WebView) tags its User-Agent with
    // "DocuMintApp". On native we DON'T use the in-browser WebContainer runtime
    // (it can't boot in a WebView), so /code must not be cross-origin-isolated —
    // `require-corp` would block the server-sandbox live-preview iframe on WebKit.
    const isNativeApp = isNativeUserAgent(request.headers.get("user-agent"));

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
    //
    // In the native shell we skip isolation entirely (`unsafe-none`): WebContainers
    // are never used there, and any isolation would block the cross-origin
    // *.vercel.run sandbox preview iframe on WebKit.
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set(
        "Cross-Origin-Embedder-Policy",
        isCode
            ? isNativeApp
                ? "unsafe-none"
                : coepForUserAgent(request.headers.get("user-agent"))
            : "credentialless",
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

    // Vercel Sandbox live-preview origin. `sandbox.domain(port)` returns a
    // https://*.vercel.run URL (src/lib/agent/agent-sandbox.ts) that the IDE embeds
    // in an <iframe> (src/components/ide/live-preview.tsx). It's the ONLY runtime
    // preview surface on native (WebContainers are desktop-only), so it must be
    // allowed in frame-src/connect-src or the preview is silently CSP-blocked.
    const sandboxPreviewOrigin = "https://*.vercel.run";

    const csp = (isCode ? `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://va.vercel-scripts.com https://cdn.jsdelivr.net ${webContainerOrigins};
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net;
    img-src 'self' blob: data: https: http://localhost:*;
    font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net;
    connect-src 'self' blob: http://localhost:* ws: wss: https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://*.auth0.com https://api.stripe.com https://checkout.stripe.com https://vitals.vercel-insights.com ${sandboxPreviewOrigin} ${webContainerOrigins};
    frame-src 'self' blob: http://localhost:* ${sandboxPreviewOrigin} ${webContainerOrigins};
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
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|public/).*)"],
};
