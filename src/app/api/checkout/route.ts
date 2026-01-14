import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import Stripe from "stripe";

// Lazy initialization to prevent build errors when env var is missing
function getStripe() {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
    });
}

const PRICE_IDS: Record<string, string> = {
    starter: process.env.STRIPE_PRICE_ID_STARTER || "price_starter_placeholder",
    pro: process.env.STRIPE_PRICE_ID_PRO || "price_pro_placeholder",
    team: process.env.STRIPE_PRICE_ID_TEAM || "price_team_placeholder",
};

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const tier = searchParams.get("tier");

        if (!tier || !PRICE_IDS[tier]) {
            return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
        }

        const priceId = PRICE_IDS[tier];

        // Check if this is a placeholder (Stripe not configured)
        if (priceId.includes("placeholder")) {
            return NextResponse.json(
                { error: "Stripe is not configured. Please add STRIPE_PRICE_ID_* environment variables." },
                { status: 400 }
            );
        }

        const stripe = getStripe();
        const origin = request.headers.get("origin") || process.env.NEXTAUTH_URL || "http://localhost:3000";

        // Create Stripe checkout session
        const checkoutSession = await stripe.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/dashboard/billing?canceled=true`,
            customer_email: session.user.email,
            metadata: {
                userId: session.user.id,
                tier,
            },
            subscription_data: (tier === "pro" || tier === "team") ? {
                trial_period_days: 14,
            } : undefined,
        });

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        console.error("Checkout error:", error);
        return NextResponse.json(
            { error: "Failed to create checkout session" },
            { status: 500 }
        );
    }
}
