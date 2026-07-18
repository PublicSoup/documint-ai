import { encode as encodeSessionJwt, decode as decodeSessionJwt } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { env } from "./env";

/**
 * Bridges native mobile clients onto the same session mechanism the web app
 * already uses (NextAuth v4, `session.strategy: "jwt"`). Mobile never talks
 * to a bespoke token scheme: `mintAccessToken` produces the exact same JWT
 * shape `authOptions.callbacks.jwt` would produce for a browser session, so
 * it can be placed straight into the NextAuth session cookie and decoded by
 * every one of the ~113 existing `getServerSession(authOptions)` call sites
 * with zero changes to those routes. See `translateBearerToSessionCookie`,
 * invoked from `src/proxy.ts`, for the other half of the bridge.
 *
 * This file is imported by `src/proxy.ts` (Next.js Edge middleware), so it
 * deliberately sticks to edge-safe APIs only — no `node:crypto`, no Prisma.
 * Refresh-token issuance/rotation (which needs both) lives in
 * `src/lib/mobile-auth-tokens.ts`, imported only by the Node.js-runtime
 * mobile auth route handlers, never by proxy.ts.
 */

// Matches NextAuth v4's default JWT session maxAge (30 days) so a mobile
// access token behaves identically to a browser session token.
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface MobileSessionUser {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    role: string;
}

/**
 * NextAuth v4 derives the cookie name (and whether it's the `__Secure-`
 * prefixed variant) from whether the deployment is served over https, not
 * from `NODE_ENV` directly. Mirrors the same derivation NextAuth's internal
 * `cookie.ts` uses so a mobile-minted token lands in the cookie NextAuth's
 * own `getServerSession`/`getToken` will actually look for.
 */
export function getSessionCookieName(): string {
    const useSecureCookies = env.NEXTAUTH_URL.startsWith("https://");
    return `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`;
}

/**
 * Mints a session token for a mobile client. The payload mirrors exactly
 * what `authOptions.callbacks.jwt` puts on a token during a normal browser
 * sign-in (see `src/lib/auth.ts`) — `sub`/`name`/`email`/`picture` are what
 * NextAuth's core uses to populate `session.user`, and `id`/`role` are what
 * this app's own `session` callback additionally reads.
 */
export async function mintAccessToken(user: MobileSessionUser): Promise<string> {
    return encodeSessionJwt({
        token: {
            sub: user.id,
            id: user.id,
            role: user.role,
            name: user.name,
            email: user.email,
            picture: user.image,
        },
        secret: env.NEXTAUTH_SECRET,
        maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    });
}

/** Verifies a mobile access token the same way NextAuth verifies its own session cookie. */
export async function verifyAccessToken(token: string): Promise<MobileSessionUser | null> {
    try {
        const decoded = await decodeSessionJwt({ token, secret: env.NEXTAUTH_SECRET });
        const id = typeof decoded?.id === "string" ? decoded.id : null;
        if (!id) return null;

        return {
            id,
            email: typeof decoded?.email === "string" ? decoded.email : null,
            name: typeof decoded?.name === "string" ? decoded.name : null,
            image: typeof decoded?.picture === "string" ? decoded.picture : null,
            role: typeof decoded?.role === "string" ? decoded.role : "USER",
        };
    } catch {
        return null;
    }
}

/**
 * The one integration point in `src/proxy.ts`: if the request carries a
 * bearer token and no existing NextAuth session cookie, verify it and
 * return the `Cookie` header value that should be forwarded to the route
 * handler so `getServerSession`/`getToken` see a normal session. Returns
 * `null` whenever there is nothing to translate (the overwhelming majority
 * of requests — every existing browser request included), so callers can
 * treat `null` as "leave the request untouched."
 */
export async function translateBearerToSessionCookie(request: NextRequest): Promise<string | null> {
    const cookieName = getSessionCookieName();
    if (request.cookies.get(cookieName)) {
        // A real browser session cookie already present — never override it.
        return null;
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const bearerToken = authHeader.slice("Bearer ".length).trim();
    if (!bearerToken) {
        return null;
    }

    // Re-encoding (rather than forwarding the raw bearer value) confirms the
    // token verifies under this server's secret before it's trusted as a
    // session cookie, and normalizes it into exactly the shape/algorithm
    // NextAuth's own cookie decoder expects.
    const user = await verifyAccessToken(bearerToken);
    if (!user) {
        return null;
    }

    const sessionToken = await mintAccessToken(user);
    return `${cookieName}=${sessionToken}`;
}
