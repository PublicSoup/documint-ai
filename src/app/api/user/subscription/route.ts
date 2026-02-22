import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription } from "@/lib/subscription";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/api-utils";

/**
 * GET /api/user/subscription
 * Returns the current subscription plan for the authenticated user.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            // Rate limit unauthenticated checks by IP to prevent abuse
            const ip = await getClientIP(req);
            await enforceRateLimit(ip, "api");

            return NextResponse.json({
                plan: "free",
                isPro: false,
                isTeam: false,
                isActive: false,
            });
        }

        // Rate limit authenticated checks by User ID
        await enforceRateLimit(session.user.id, "api");

        const sub = await getUserSubscription(session.user.id);
        return NextResponse.json({
            plan: sub.plan,
            isPro: sub.isPro,
            isTeam: sub.isTeam,
            isActive: sub.isActive,
        });
    } catch (error) {
        // Return a valid fallback structure so UI doesn't crash on auth/limit errors
        console.error("Subscription API Error:", error);
        return NextResponse.json({
            plan: "free",
            isPro: false,
            isTeam: false,
            isActive: false,
            error: "Failed to load subscription data"
        });
    }
}
