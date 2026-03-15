// Zod validation is not used here because the Stripe SDK's `constructEvent`
// function is the canonical way to verify and parse the webhook body.
// This ensures the event is authentic and matches Stripe's defined schemas.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { upsertSubscription, cancelSubscription, getPlanFromPriceId } from "@/lib/subscription";
import { sendEmail, emailTemplates } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit-logger";
import { sendNotification } from "@/lib/notifications";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

function getSubscriptionPriceId(subscription: Stripe.Subscription): string {
    return subscription.items.data[0]?.price?.id || "";
}

function asSubscriptionId(value: string | { id: string } | null): string | null {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const withSubscription = invoice as Stripe.Invoice & {
        subscription?: string | { id: string } | null;
    };

    return asSubscriptionId(withSubscription.subscription || null);
}

function extractPeriodDates(subscription: Stripe.Subscription): {
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
} {
    const legacyShape = subscription as Stripe.Subscription & {
        current_period_start?: number;
        current_period_end?: number;
    };

    const startTimestamp = legacyShape.current_period_start ?? subscription.billing_cycle_anchor;
    const endTimestamp = legacyShape.current_period_end ?? subscription.cancel_at ?? null;

    return {
        currentPeriodStart: startTimestamp ? new Date(startTimestamp * 1000) : null,
        currentPeriodEnd: endTimestamp ? new Date(endTimestamp * 1000) : null,
    };
}

export async function POST(request: NextRequest) {
    if (!webhookSecret) {
        return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
        return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    try {
        const clientIp = await getClientIP(request);
        await enforceRateLimit(clientIp, "security");
    } catch {
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error) {
        console.error("Webhook signature verification failed:", error);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutCompleted(session);
                break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdated(subscription);
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(subscription);
                break;
            }

            case "invoice.payment_succeeded": {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentSucceeded(invoice);
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(invoice);
                break;
            }

            default:
                break;
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Webhook handler error:", error);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const customerId = typeof session.customer === "string" ? session.customer : null;
    const subscriptionId = asSubscriptionId(session.subscription);

    if (!userId || !customerId || !subscriptionId) {
        console.error("Missing checkout metadata for subscription creation");
        return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = getSubscriptionPriceId(subscription);
    const plan = getPlanFromPriceId(priceId);
    const period = extractPeriodDates(subscription);

    await upsertSubscription({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        status: subscription.status,
        plan,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    });

    try {
        await logAudit({
            userId,
            action: "SUBSCRIPTION_CREATED",
            entity: "Subscription",
            entityId: subscriptionId,
            details: { plan, status: subscription.status },
        });
    } catch {
        // Non-blocking
    }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
    if (!customerId) {
        return;
    }

    const existingSub = await db.subscription.findFirst({
        where: { stripeCustomerId: customerId },
    });

    if (!existingSub) {
        return;
    }

    const priceId = getSubscriptionPriceId(subscription);
    const plan = getPlanFromPriceId(priceId);
    const period = extractPeriodDates(subscription);

    await db.subscription.update({
        where: { id: existingSub.id },
        data: {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            status: subscription.status,
            plan,
            currentPeriodStart: period.currentPeriodStart,
            currentPeriodEnd: period.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
    });

    try {
        await logAudit({
            userId: existingSub.userId,
            action: "SUBSCRIPTION_UPDATED",
            entity: "Subscription",
            entityId: subscription.id,
            details: {
                previousPlan: existingSub.plan,
                newPlan: plan,
                status: subscription.status,
            },
        });
    } catch {
        // Non-blocking
    }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const existing = await db.subscription.findUnique({
        where: { stripeSubscriptionId: subscription.id },
        select: { userId: true, plan: true },
    });

    await cancelSubscription(subscription.id);

    try {
        await logAudit({
            userId: existing?.userId,
            action: "SUBSCRIPTION_DELETED",
            entity: "Subscription",
            entityId: subscription.id,
            details: {
                plan: existing?.plan || "unknown",
                status: "canceled",
            },
        });
    } catch {
        // Non-blocking
    }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
    const subscriptionId = getInvoiceSubscriptionId(invoice);

    await logAudit({
        action: "PAYMENT_SUCCESS",
        entity: "Subscription",
        entityId: subscriptionId || customerId || invoice.id,
        details: {
            amount: invoice.amount_paid / 100,
            currency: invoice.currency,
            invoiceId: invoice.id,
        },
    });

    if (!customerId) return;

    const subscription = await db.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        include: { user: true },
    });

    if (!subscription?.user?.email) return;

    const amount = invoice.amount_paid / 100;
    const invoiceUrl = `https://dashboard.stripe.com/invoices/${invoice.id}`;
    const planName = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);

    await sendEmail({
        to: subscription.user.email,
        subject: `Payment Confirmed - DocuMint AI ${planName} Plan`,
        html: emailTemplates.paymentSuccess(
            subscription.user.name || "Customer",
            invoiceUrl,
            planName,
            `$${amount}`
        ),
    });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
    const subscriptionId = getInvoiceSubscriptionId(invoice);

    if (!customerId) {
        return;
    }

    await db.subscription.updateMany({
        where: { stripeCustomerId: customerId },
        data: { status: "past_due" },
    });

    const subscription = await db.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        include: { user: true },
    });

    if (subscription?.userId) {
        await sendNotification({
            userId: subscription.userId,
            type: "SYSTEM",
            title: "Payment Failed ⚠️",
            message: "Your payment failed. Please update your payment method to keep your subscription active.",
            link: "/dashboard/billing",
        });
    }

    await logAudit({
        userId: subscription?.userId,
        action: "PAYMENT_FAILED",
        entity: "Subscription",
        entityId: subscriptionId || customerId,
        details: {
            amount: invoice.amount_due / 100,
            currency: invoice.currency,
            invoiceId: invoice.id,
        },
    });
}
