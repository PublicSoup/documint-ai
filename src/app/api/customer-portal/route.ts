import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const origin = request.headers.get("origin") || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        // First, check the database for a stored customer ID
        const subscription = await db.subscription.findUnique({
            where: { userId: session.user.id }
        });

        let customerId = subscription?.stripeCustomerId;

        // Fallback: search by email in Stripe if not in DB
        if (!customerId) {
            const customers = await stripe.customers.list({
                email: session.user.email,
                limit: 1,
            });
            customerId = customers.data[0]?.id;

            // Self-heal: If found in Stripe but not in DB, update DB
            if (customerId) {
                console.log(`Self-healing: Found Stripe Customer ID ${customerId} for user ${session.user.email}`);
                await db.subscription.upsert({
                    where: { userId: session.user.id },
                    create: {
                        userId: session.user.id,
                        stripeCustomerId: customerId,
                        status: "tea_pot", // Placeholder status until webhook updates it
                        plan: "free"
                    },
                    update: {
                        stripeCustomerId: customerId
                    }
                });
            }
        }

        if (!customerId) {
            // If the user is in Dev Pro mode, we should explain why the portal is unavailable
            const isDevPro = env.NEXT_PUBLIC_DEV_PRO === "true";
            const message = isDevPro
                ? "You are currently in Developer Pro mode (local override). You don't have a real Stripe subscription yet. Upgrade to a real plan to enable the billing portal."
                : "No active billing account found. Please upgrade to a plan first.";

            return NextResponse.json(
                { error: message },
                { status: 400 }
            );
        }

        // Create portal session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${origin}/dashboard/billing`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error: any) {
        console.error("Portal error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create portal session" },
            { status: 500 }
        );
    }
}
