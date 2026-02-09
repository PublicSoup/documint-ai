import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const PRICE_IDS: Record<string, string> = {
    starter: env.STRIPE_PRICE_ID_STARTER,
    pro: env.STRIPE_PRICE_ID_PRO,
    team: env.STRIPE_PRICE_ID_TEAM,
};

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        console.log("Checkout POST - Session:", JSON.stringify({
            hasSession: !!session,
            hasUser: !!session?.user,
            userId: session?.user?.id,
            userEmail: session?.user?.email,
            envUrl: env.NEXTAUTH_URL,
            nodeEnv: process.env.NODE_ENV
        }));

        if (!session?.user?.id || !session?.user?.email) {
            return NextResponse.json({
                error: "Unauthorized",
                debug: {
                    noSession: !session,
                    noUser: !session?.user,
                    noId: !session?.user?.id,
                    noEmail: !session?.user?.email
                }
            }, { status: 401 });
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

        const origin = request.headers.get("origin") || env.NEXTAUTH_URL || "http://localhost:3000";

        // Check if user already has a Stripe Customer ID
        const userSubscription = await db.subscription.findUnique({
            where: { userId: session.user.id }
        });

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
            customer: userSubscription?.stripeCustomerId || undefined,
            customer_email: userSubscription?.stripeCustomerId ? undefined : session.user.email,
            metadata: {
                userId: session.user.id,
                tier,
            },
            subscription_data: (tier === "pro" || tier === "team") ? {
                trial_period_days: 14,
            } : undefined,
        });

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error: any) {
        console.error("Checkout error:", {
            message: error.message,
            stack: error.stack,
            stripeError: error.raw || error.type || "unknown"
        });
        return NextResponse.json(
            {
                error: "Failed to create checkout session",
                details: error.message || "Unknown error",
                code: error.code || "unknown_error",
                stripeErrorType: error.type || "unknown"
            },
            { status: error.statusCode || 500 }
        );
    }
}
