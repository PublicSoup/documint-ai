import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

function resolveOrigin(request: NextRequest): string {
    const origin = request.headers.get("origin");
    if (origin) return origin;
    if (env.NEXT_PUBLIC_APP_URL) return env.NEXT_PUBLIC_APP_URL;
    return "http://localhost:3000";
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await enforceRateLimit(session.user.id, "api");

        const user = await db.user.findUnique({
            where: { id: session.user.id },
            include: { subscription: true },
        });

        if (!user?.subscription?.stripeCustomerId) {
            return NextResponse.json({ error: "No billing account found" }, { status: 400 });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.subscription.stripeCustomerId,
            return_url: `${resolveOrigin(request)}/dashboard/billing`,
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_BILLING_PORTAL_SESSION",
                entity: "Subscription",
                entityId: session.user.id,
                details: { customerId: user.subscription.stripeCustomerId },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        console.error("Checkout portal error:", error);
        return NextResponse.json({ error: "Failed to create billing portal session" }, { status: 500 });
    }
}
