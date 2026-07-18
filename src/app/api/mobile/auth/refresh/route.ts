import { z } from "zod";
import { rotateRefreshToken } from "@/lib/mobile-auth-tokens";
import { ApiErrors, errorResponse, successResponse, validateBody } from "@/lib/api-utils";

const refreshSchema = z
    .object({
        refreshToken: z.string().trim().min(1).max(512),
        deviceInfo: z.string().trim().max(200).optional(),
    })
    .strict();

/** Rotates a mobile refresh token into a fresh access/refresh token pair. */
export async function POST(req: Request) {
    try {
        const { refreshToken, deviceInfo } = await validateBody(req, refreshSchema);

        const session = await rotateRefreshToken(refreshToken, deviceInfo);
        if (!session) {
            throw ApiErrors.unauthorized("Refresh token is invalid, expired, or revoked.");
        }

        return successResponse(session);
    } catch (error) {
        return errorResponse(error);
    }
}
