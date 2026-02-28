import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

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

/**
 * POST /api/checkout/portal
 * Creates a Stripe Customer Portal session for the authenticated user.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Fetch User and Subscription
        const user = await db.user.findUnique({
            where: { id: session.user.id },
            include: { subscription: true },
        });

        if (!user?.subscription?.stripeCustomerId) {
            return errorResponse(ApiErrors.badRequest("No active billing account found. Please subscribe first."));
        }

        // 3. Create Portal Session
        const resolvedOrigin = resolveOrigin(request);
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.subscription.stripeCustomerId,
            return_url: `${resolvedOrigin}/dashboard/settings?tab=billing`,
        });

        if (!portalSession.url) {
            throw ApiErrors.serviceUnavailable("Unable to create billing portal session");
        }

        // 4. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "CREATE_BILLING_PORTAL_SESSION",
                entity: "Subscription",
                entityId: session.user.id,
                details: {
                    customerId: user.subscription.stripeCustomerId,
                    returnOrigin: resolvedOrigin,
                },
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json(
            { url: portalSession.url },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    } catch (error) {
        return errorResponse(error);
    }
}
