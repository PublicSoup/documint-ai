import { randomBytes, createHash } from "crypto";
import {
    ACCESS_TOKEN_MAX_AGE_SECONDS,
    mintAccessToken,
    type MobileSessionUser,
} from "./mobile-auth";

/**
 * Refresh-token issuance/verification/rotation for the mobile auth routes
 * (`src/app/api/mobile/auth/**`). Split out of `src/lib/mobile-auth.ts`
 * because this file needs `node:crypto` and Prisma, neither of which are
 * available in the Edge runtime that `src/proxy.ts` (the other consumer of
 * mobile-auth.ts) runs in — keeping them separate means proxy.ts's bundle
 * never pulls in Node-only APIs.
 */

// Refresh tokens outlive access tokens so a client can stay signed in across
// the access token's rotation without re-prompting for credentials.
export const REFRESH_TOKEN_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

/** Opaque, high-entropy refresh token. Only its hash is ever persisted. */
export function generateRefreshToken(): string {
    return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export interface MobileSession {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    user: MobileSessionUser;
}

/**
 * Issues a fresh access/refresh token pair for a user and persists the
 * refresh token's hash. Used by every mobile auth route that establishes a
 * new session (credentials login, OAuth exchange, refresh rotation).
 */
export async function issueMobileSession(user: MobileSessionUser, deviceInfo?: string | null): Promise<MobileSession> {
    const { db } = await import("./db");

    const accessToken = await mintAccessToken(user);
    const refreshToken = generateRefreshToken();

    await db.mobileRefreshToken.create({
        data: {
            userId: user.id,
            tokenHash: hashRefreshToken(refreshToken),
            deviceInfo: deviceInfo ?? undefined,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
        },
    });

    return {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + ACCESS_TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
        user,
    };
}

/**
 * Verifies a refresh token, rotates it (revokes the old row, issues a new
 * one) and mints a new access token. Rotation means a stolen-and-reused
 * refresh token is invalidated the moment the legitimate client refreshes
 * again — the old `tokenHash` can never redeem a session a second time.
 * Returns `null` for any invalid/expired/revoked/unknown-user token.
 */
export async function rotateRefreshToken(refreshToken: string, deviceInfo?: string | null): Promise<MobileSession | null> {
    const { db } = await import("./db");
    const tokenHash = hashRefreshToken(refreshToken);

    const stored = await db.mobileRefreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        return null;
    }

    const user = await db.user.findUnique({
        where: { id: stored.userId },
        select: { id: true, email: true, name: true, image: true, role: true },
    });
    if (!user) {
        return null;
    }

    await db.mobileRefreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
    });

    return issueMobileSession(user, deviceInfo);
}

/** Revokes a refresh token (logout). Silently no-ops for an unknown/already-revoked token. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
    const { db } = await import("./db");
    const tokenHash = hashRefreshToken(refreshToken);

    await db.mobileRefreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
    });
}
