import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserSubscription } from "@/lib/subscription";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ plan: "free" });
    }

    try {
        const sub = await getUserSubscription(session.user.id);
        return NextResponse.json({
            plan: sub.plan,
            isPro: sub.isPro,
            isTeam: sub.isTeam,
            isActive: sub.isActive
        });
    } catch (error) {
        return NextResponse.json({ plan: "free" });
    }
}
