import { NextResponse } from "next/server";
import { validateAdmin } from "@/lib/admin-auth";

export async function GET() {
    // Hard-blocked in production — this route is development/staging only.
    // Even if admin auth is valid, we never expose env metadata on a live deployment.
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const { authorized, response } = await validateAdmin();
    if (!authorized) return response;

    const dbUrl = process.env.DATABASE_URL || "undefined";
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ":***@");

    return NextResponse.json({
        node_env: process.env.NODE_ENV,
        database_url_masked: maskedUrl,
        is_localhost: dbUrl.includes("localhost"),
        direct_url_exists: !!process.env.DIRECT_URL
    });
}
