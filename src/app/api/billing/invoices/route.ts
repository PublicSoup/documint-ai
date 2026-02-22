import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { z } from "zod";

const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

/**
 * GET /api/billing/invoices
 * Lists the authenticated user's Stripe invoices.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Enforce Rate Limit
        await enforceRateLimit(session.user.id, "api");

        // 2. Validate Query Params
        const { searchParams } = new URL(req.url);
        const validatedQuery = querySchema.safeParse({
            limit: searchParams.get("limit") || undefined,
        });

        if (!validatedQuery.success) {
            return errorResponse(ApiErrors.badRequest("Invalid query parameters"));
        }

        const { limit } = validatedQuery.data;

        // 3. Fetch Subscription
        const subscription = await db.subscription.findUnique({
            where: { userId: session.user.id },
            select: { stripeCustomerId: true }
        });

        if (!subscription || !subscription.stripeCustomerId) {
            return NextResponse.json({ invoices: [] });
        }

        // 4. Fetch from Stripe
        const invoices = await stripe.invoices.list({
            customer: subscription.stripeCustomerId,
            limit,
        });

        const simplifiedInvoices = invoices.data.map(invoice => ({
            id: invoice.id,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: invoice.status,
            date: new Date(invoice.created * 1000).toISOString(),
            pdfUrl: invoice.invoice_pdf,
            number: invoice.number
        }));

        return NextResponse.json({ invoices: simplifiedInvoices });
    } catch (error) {
        return errorResponse(error);
    }
}
