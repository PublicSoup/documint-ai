import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { upsertSubscription, cancelSubscription, getPlanFromPriceId } from "@/lib/subscription";
import { sendEmail, emailTemplates } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit-logger";

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
        return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    console.log(`Stripe webhook received: ${event.type}`);

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
                console.log(`Unhandled event type: ${event.type}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Webhook handler error:", error);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    if (!userId) {
        console.error("No userId in checkout session metadata");
        return;
    }

    // Get the subscription details
    const subscriptionResponse = await stripe.subscriptions.retrieve(subscriptionId);
    // Cast to any to access properties that may differ between Stripe versions
    const subscription = subscriptionResponse as any;
    const priceId = subscription.items.data[0]?.price.id;
    const plan = getPlanFromPriceId(priceId);

    await upsertSubscription({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        status: subscription.status,
        plan,
        currentPeriodStart: new Date((subscription.current_period_start || 0) * 1000),
        currentPeriodEnd: new Date((subscription.current_period_end || 0) * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    });

    console.log(`Created subscription for user ${userId}: ${plan}`);
}

async function handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription) {
    // Cast to any to access properties that may differ between Stripe versions
    const subscription = stripeSubscription as any;
    const customerId = subscription.customer as string;

    // Find user by Stripe customer ID
    const existingSub = await db.subscription.findFirst({
        where: { stripeCustomerId: customerId },
    });

    if (!existingSub) {
        console.log("No existing subscription found for customer:", customerId);
        return;
    }

    const priceId = subscription.items.data[0]?.price.id;
    const plan = getPlanFromPriceId(priceId);

    await db.subscription.update({
        where: { id: existingSub.id },
        data: {
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            status: subscription.status,
            plan,
            currentPeriodStart: new Date((subscription.current_period_start || 0) * 1000),
            currentPeriodEnd: new Date((subscription.current_period_end || 0) * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
    });

    console.log(`Updated subscription ${subscription.id}: ${plan} (${subscription.status})`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    await cancelSubscription(subscription.id);
    console.log(`Canceled subscription: ${subscription.id}`);
}

async function handlePaymentSucceeded(stripeInvoice: Stripe.Invoice) {
    const invoice = stripeInvoice as any;
    const customerId = invoice.customer as string;

    // Log the payment 
    await logAudit({
        action: "PAYMENT_SUCCESS",
        entity: "Subscription",
        entityId: (invoice.subscription as string) || customerId,
        details: {
            amount: (invoice.amount_paid || 0) / 100,
            currency: invoice.currency,
            invoiceId: invoice.id,
        },
    });

    // Send payment confirmation email
    const subscription = await db.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        include: { user: true },
    });

    if (subscription?.user?.email) {
        const amount = (invoice.amount_paid || 0) / 100;
        const invoiceUrl = `https://dashboard.stripe.com/invoices/${invoice.id}`;
        const planName = subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1);

        await sendEmail({
            to: subscription.user.email,
            subject: `Payment Confirmed - DocuMint AI ${planName} Plan`,
            html: emailTemplates.paymentSuccess(
                subscription.user.name || 'Customer',
                invoiceUrl,
                planName,
                `$${amount}`
            ),
        });

        console.log(`Sent payment confirmation email to ${subscription.user.email}`);
    }

    console.log(`Payment succeeded for customer ${customerId}: $${(invoice.amount_paid || 0) / 100}`);
}

async function handlePaymentFailed(stripeInvoice: Stripe.Invoice) {
    const invoice = stripeInvoice as any;
    const customerId = invoice.customer as string;

    // Mark subscription as past_due
    await db.subscription.updateMany({
        where: { stripeCustomerId: customerId },
        data: { status: "past_due" },
    });

    // Create notification for user
    const subscription = await db.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        include: { user: true },
    });

    if (subscription?.userId) {
        await db.notification.create({
            data: {
                userId: subscription.userId,
                type: "SYSTEM",
                message: "Your payment failed. Please update your payment method to keep your subscription active.",
                link: "/dashboard/billing",
            },
        });
    }

    // Log the failure
    await logAudit({
        userId: subscription?.userId,
        action: "PAYMENT_FAILED",
        entity: "Subscription",
        entityId: (invoice.subscription as string) || customerId,
        details: {
            amount: (invoice.amount_due || 0) / 100,
            currency: invoice.currency,
            invoiceId: invoice.id,
        },
    });

    console.log(`Payment failed for customer ${customerId}`);
}
