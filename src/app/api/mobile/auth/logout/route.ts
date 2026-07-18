import { z } from "zod";
import { revokeRefreshToken } from "@/lib/mobile-auth-tokens";
import { errorResponse, successResponse, validateBody } from "@/lib/api-utils";

const logoutSchema = z
    .object({
        refreshToken: z.string().trim().min(1).max(512),
    })
    .strict();

/**
 * Revokes a mobile refresh token. Always returns success (even for an
 * unknown/already-revoked token) — from the client's perspective "log out"
 * has succeeded either way, and this endpoint must not leak which refresh
 * tokens are currently valid.
 */
export async function POST(req: Request) {
    try {
        const { refreshToken } = await validateBody(req, logoutSchema);
        await revokeRefreshToken(refreshToken);
        return successResponse({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}
