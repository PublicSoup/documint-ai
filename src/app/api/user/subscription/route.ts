import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription, DEFAULT_SUBSCRIPTION } from "@/lib/subscription";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

/**
 * GET /api/user/subscription
 * Returns the current subscription plan for the authenticated user.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const sub = await getUserSubscription(session.user.id);
        const { plan, isPro, isTeam, isActive } = sub;
        return NextResponse.json({ plan, isPro, isTeam, isActive });
    } catch (error) {
        return errorResponse(error);
    }
}
