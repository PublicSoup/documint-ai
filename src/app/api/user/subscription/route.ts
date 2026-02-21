import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription } from "@/lib/subscription";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        try {
            const ip = await getClientIP(req);
            await enforceRateLimit(ip, "api");
        } catch {
            // Keep unauthenticated plan check resilient.
        }

        return NextResponse.json({
            plan: "free",
            isPro: false,
            isTeam: false,
            isActive: false,
        });
    }

    try {
        await enforceRateLimit(session.user.id, "api");

        const sub = await getUserSubscription(session.user.id);
        return NextResponse.json({
            plan: sub.plan,
            isPro: sub.isPro,
            isTeam: sub.isTeam,
            isActive: sub.isActive,
        });
    } catch (error) {
        console.error("Failed to fetch subscription:", error);
        return NextResponse.json({
            plan: "free",
            isPro: false,
            isTeam: false,
            isActive: false,
        });
    }
}
