import { z } from "zod";
import { verifyCredentials } from "@/lib/auth";
import { issueMobileSession } from "@/lib/mobile-auth-tokens";
import { ApiErrors, errorResponse, successResponse, validateBody } from "@/lib/api-utils";

const loginSchema = z
    .object({
        email: z.string().trim().min(1).max(255),
        password: z.string().min(1).max(200),
        deviceInfo: z.string().trim().max(200).optional(),
    })
    .strict();

/**
 * Mobile equivalent of the web's `CredentialsProvider` sign-in — same
 * `verifyCredentials` path (rate limiting, bcrypt compare, audit logging),
 * but returns a bearer token pair instead of setting a browser cookie.
 */
export async function POST(req: Request) {
    try {
        const { email, password, deviceInfo } = await validateBody(req, loginSchema);

        const user = await verifyCredentials({ email, password });
        if (!user) {
            throw ApiErrors.unauthorized("Invalid email or password.");
        }

        const session = await issueMobileSession(user, deviceInfo);
        return successResponse(session);
    } catch (error) {
        return errorResponse(error);
    }
}
