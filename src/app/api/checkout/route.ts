import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors, validateQuery } from "@/lib/api-utils";

const tierSchema = z.object({
    tier: z.enum(["starter", "pro", "team"]),
}).strict();

const PRICE_IDS: Record<z.infer<typeof tierSchema>["tier"], string> = {
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

/**
 * POST /api/checkout?tier=starter|pro|team
 * Creates a Stripe Checkout Session for subscription upgrades.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session?.user?.email) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Query Params
        const { searchParams } = new URL(request.url);
        const { tier } = validateQuery(searchParams, tierSchema);

        const priceId = PRICE_IDS[tier];

        if (!priceId || priceId.includes("placeholder")) {
            return errorResponse(ApiErrors.serviceUnavailable("Billing system is not fully configured. Please contact support."));
        }

        const origin = resolveOrigin(request);

        // 3. Fetch User Subscription Context
        const userSubscription = await db.subscription.findUnique({
            where: { userId: session.user.id },
            select: { stripeCustomerId: true },
        });

        // 4. Create Stripe Checkout Session
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

        // 5. Audit Log
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
        return errorResponse(error);
    }
}
