import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const subscription = await db.subscription.findUnique({
            where: { userId: session.user.id }
        });

        if (!subscription || !subscription.stripeCustomerId) {
            return NextResponse.json({ invoices: [] });
        }

        const invoices = await stripe.invoices.list({
            customer: subscription.stripeCustomerId,
            limit: 10,
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
        console.error("Failed to fetch invoices", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
