import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { subscription: true }
        });

        if (!user || (!user.subscription?.stripeCustomerId)) {
            return new NextResponse("No customer found", { status: 400 });
        }

        const customerId = user.subscription.stripeCustomerId;

        if (!customerId) {
            return new NextResponse("No active subscription", { status: 400 });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error: any) {
        console.error("Portal error:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
