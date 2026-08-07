import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { env } from "./env";

/**
 * Native OAuth session hand-off.
 *
 * OAuth runs entirely in the device's system browser (Google blocks embedded
 * WebViews), so the resulting NextAuth session cookie lives there, not in the app
 * WebView. To move the session into the WebView we mint a short-lived, single-use
 * "hand-off token", deep-link it back into the app, and exchange it for a real
 * session cookie set on the WebView.
 *
 *   system browser (authed) → /auth/native-callback → mint hand-off token
 *     → documintai://auth/callback?token=… → app WebView
 *     → /api/auth/native-exchange → verify+consume → Set-Cookie session → /dashboard
 *
 * The hand-off token is a stateless HMAC(payload) signed with NEXTAUTH_SECRET and
 * expires in 120s. Single-use is enforced best-effort via Upstash (if configured);
 * otherwise the short expiry is the guard. The session token itself never travels
 * in a URL — it's set as an httpOnly cookie by the exchange.
 */

const HANDOFF_TTL_SECONDS = 120;
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // matches NextAuth's 30-day default

interface HandoffPayload {
    sub: string;
    jti: string;
    exp: number;
}

function signHandoff(body: string): string {
    return createHmac("sha256", env.NEXTAUTH_SECRET).update(body).digest("base64url");
}

export function createNativeHandoffToken(userId: string): string {
    const payload: HandoffPayload = {
        sub: userId,
        jti: randomUUID(),
        exp: Math.floor(Date.now() / 1000) + HANDOFF_TTL_SECONDS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${signHandoff(body)}`;
}

/**
 * Best-effort single-use guard. Returns true if this jti has NOT been seen (i.e.
 * the token may be consumed). If Upstash is unconfigured or unreachable, returns
 * true so a healthy sign-in isn't blocked — expiry remains the backstop.
 */
async function claimJti(jti: string): Promise<boolean> {
    const url = env.UPSTASH_REDIS_REST_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token || url === "https://upstash-redis-url.com") return true;
    try {
        const { Redis } = await import("@upstash/redis");
        const redis = new Redis({ url, token });
        const result = await redis.set(`native-handoff:${jti}`, "1", { nx: true, ex: HANDOFF_TTL_SECONDS });
        return result === "OK";
    } catch {
        return true;
    }
}

export async function verifyNativeHandoffToken(token: string): Promise<{ userId: string } | null> {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, signature] = parts;

    const expected = signHandoff(body);
    const provided = Buffer.from(signature);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null;

    let payload: HandoffPayload;
    try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HandoffPayload;
    } catch {
        return null;
    }

    if (!payload.sub || !payload.jti || typeof payload.exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    if (!(await claimJti(payload.jti))) return null;

    return { userId: payload.sub };
}

export interface MintedSessionCookie {
    name: string;
    value: string;
    options: {
        httpOnly: true;
        sameSite: "lax";
        path: "/";
        secure: boolean;
        maxAge: number;
    };
}

/**
 * Mint a NextAuth-compatible (JWT-strategy) session cookie for `user`. The payload
 * mirrors what src/lib/auth.ts's jwt callback stores (id + role) so the session
 * callback resolves identically on subsequent requests. Uses next-auth/jwt encode
 * with the same secret, so NextAuth decodes it normally.
 */
export async function mintSessionCookie(user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    role: string;
}): Promise<MintedSessionCookie> {
    const useSecure = env.NEXTAUTH_URL.startsWith("https://");
    const value = await encode({
        token: {
            sub: user.id,
            id: user.id,
            role: user.role,
            name: user.name,
            email: user.email,
            picture: user.image,
        },
        secret: env.NEXTAUTH_SECRET,
        maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return {
        name: `${useSecure ? "__Secure-" : ""}next-auth.session-token`,
        value,
        options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: useSecure,
            maxAge: SESSION_MAX_AGE_SECONDS,
        },
    };
}
