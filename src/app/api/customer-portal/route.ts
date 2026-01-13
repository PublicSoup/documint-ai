import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id || !session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const origin = request.headers.get("origin") || process.env.NEXTAUTH_URL || "http://localhost:3000";

        let stripe;
        try {
            stripe = getStripe();
        } catch (e) {
            return NextResponse.json({ error: "Stripe configuration missing on server." }, { status: 500 });
        }

        // Find existing customer
        const customers = await stripe.customers.list({
            email: session.user.email,
            limit: 1,
        });

        let customerId = customers.data[0]?.id;

        if (!customerId) {
            return NextResponse.json(
                { error: "You don't have an active billing account yet. Upgrade to a plan first." },
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
