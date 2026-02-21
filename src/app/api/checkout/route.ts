import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";

const tierSchema = z.enum(["starter", "pro", "team"]);

const PRICE_IDS: Record<z.infer<typeof tierSchema>, string> = {
    starter: env.STRIPE_PRICE_ID_STARTER,
    pro: env.STRIPE_PRICE_ID_PRO,
    team: env.STRIPE_PRICE_ID_TEAM,
};

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

        const tierResult = tierSchema.safeParse(new URL(request.url).searchParams.get("tier"));
        if (!tierResult.success) {
            return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
        }

        const tier = tierResult.data;
        const priceId = PRICE_IDS[tier];

        if (!priceId || priceId.includes("placeholder")) {
            return NextResponse.json(
                { error: "Billing is not fully configured. Missing Stripe price IDs." },
                { status: 503 }
            );
        }

        const origin = resolveOrigin(request);

        const userSubscription = await db.subscription.findUnique({
            where: { userId: session.user.id },
            select: { stripeCustomerId: true },
        });

        const checkoutSession = await stripe.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/dashboard/billing?canceled=true`,
            customer: userSubscription?.stripeCustomerId || undefined,
            customer_email: userSubscription?.stripeCustomerId ? undefined : session.user.email,
            metadata: {
                userId: session.user.id,
                tier,
            },
            subscription_data:
                tier === "pro" || tier === "team"
                    ? {
                          trial_period_days: 14,
                      }
                    : undefined,
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_CHECKOUT_SESSION",
                entity: "Subscription",
                entityId: session.user.id,
                details: { tier },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        console.error("Checkout error:", error);
        return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }
}
