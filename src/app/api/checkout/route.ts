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

const checkoutContextSchema = z.object({
    source: z.string().trim().min(1).max(80).regex(/^[a-z0-9_\-]+$/i).optional(),
    intent: z.enum(["signup", "trial"]).optional(),
    plan: z.enum(["starter", "pro", "team"]).optional(),
}).strict();

function isAllowedOrigin(origin: string): boolean {
    try {
        const parsedOrigin = new URL(origin);

        if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") {
            return false;
        }

        if (env.NEXT_PUBLIC_APP_URL) {
            const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);
            if (parsedOrigin.host === appUrl.host && parsedOrigin.protocol === appUrl.protocol) {
                return true;
            }
        }

        return parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1";
    } catch {
        return false;
    }
}

function resolveOrigin(request: NextRequest): string {
    const requestOrigin = request.headers.get("origin");

    if (requestOrigin && isAllowedOrigin(requestOrigin)) {
        return requestOrigin;
    }

    if (env.NEXT_PUBLIC_APP_URL) {
        return env.NEXT_PUBLIC_APP_URL;
    }

    return "http://localhost:3000";
}

async function parseCheckoutContext(request: NextRequest): Promise<z.infer<typeof checkoutContextSchema>> {
    try {
        const rawBody = await request.json();
        return checkoutContextSchema.parse(rawBody);
    } catch {
        return {};
    }
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

        const context = await parseCheckoutContext(request);

        if (context.plan && context.plan !== tier) {
            return errorResponse(ApiErrors.badRequest("Checkout plan context must match requested tier"));
        }

        const priceId = PRICE_IDS[tier];

        if (!priceId || priceId.includes("placeholder")) {
            return errorResponse(ApiErrors.serviceUnavailable("Billing system is not fully configured. Please contact support."));
        }

        const origin = resolveOrigin(request);
        const cancelParams = new URLSearchParams({ canceled: "true" });
        const successContextParams = new URLSearchParams();
        if (context.intent) {
            cancelParams.set("intent", context.intent);
            successContextParams.set("intent", context.intent);
        }
        if (context.plan) {
            cancelParams.set("plan", context.plan);
            successContextParams.set("plan", context.plan);
        }
        if (context.source) {
            cancelParams.set("source", context.source);
            successContextParams.set("source", context.source);
        }
        successContextParams.set("tier", tier);

        // 3. Fetch User Subscription Context
        const userSubscription = await db.subscription.findUnique({
            where: { userId: session.user.id },
            select: {
                stripeCustomerId: true,
                plan: true,
                status: true,
            },
        });

        const normalizedCurrentPlan = userSubscription?.plan?.toLowerCase();
        const normalizedCurrentStatus = userSubscription?.status?.toLowerCase();

        if (
            normalizedCurrentPlan === tier &&
            (normalizedCurrentStatus === "active" || normalizedCurrentStatus === "trialing")
        ) {
            return errorResponse(ApiErrors.badRequest("You are already subscribed to this plan."));
        }

        // 4. Create Stripe Checkout Session
        const checkoutSession = await stripe.checkout.sessions.create({
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}${successContextParams.toString().length > 0 ? `&${successContextParams.toString()}` : ""}`,
            cancel_url: `${origin}/dashboard/billing?${cancelParams.toString()}`,
            customer: userSubscription?.stripeCustomerId || undefined,
            customer_email: userSubscription?.stripeCustomerId ? undefined : session.user.email,
            metadata: {
                userId: session.user.id,
                tier,
                source: context.source ?? "unknown",
                intent: context.intent ?? "unknown",
                plan: context.plan ?? tier,
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
                details: {
                    tier,
                    source: context.source ?? null,
                    intent: context.intent ?? null,
                    plan: context.plan ?? tier,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        return errorResponse(error);
    }
}
