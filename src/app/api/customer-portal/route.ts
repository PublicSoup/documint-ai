import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse } from "@/lib/api-utils";

const customerPortalSchema = z.object({}).strict();

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
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        await enforceRateLimit(session.user.id, "api");
        customerPortalSchema.parse(request.body);

        let customerId: string | null = null;

        const subscription = await db.subscription.findUnique({
            where: { userId: session.user.id },
            select: { stripeCustomerId: true },
        });

        if (subscription?.stripeCustomerId) {
            customerId = subscription.stripeCustomerId;
        } else {
            const customers = await stripe.customers.list({
                email: session.user.email,
                limit: 1,
            });

            const discoveredCustomerId = customers.data[0]?.id;
            if (discoveredCustomerId) {
                customerId = discoveredCustomerId;

                await db.subscription.upsert({
                    where: { userId: session.user.id },
                    create: {
                        userId: session.user.id,
                        stripeCustomerId: discoveredCustomerId,
                        status: "inactive",
                        plan: "free",
                    },
                    update: {
                        stripeCustomerId: discoveredCustomerId,
                    },
                });
            }
        }

        if (!customerId) {
            throw ApiErrors.badRequest("No billing account found. Upgrade to a paid plan first.");
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${resolveOrigin(request)}/dashboard/billing`,
        });

        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_BILLING_PORTAL_SESSION",
                entity: "Subscription",
                entityId: session.user.id,
                details: { customerId },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        return errorResponse(error);
    }
}
