import { NextResponse } from "next/server";

export async function GET() {
    const dbUrl = process.env.DATABASE_URL || "undefined";
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ":***@");

    return NextResponse.json({
        node_env: process.env.NODE_ENV,
        database_url_masked: maskedUrl,
        is_localhost: dbUrl.includes("localhost"),
        direct_url_exists: !!process.env.DIRECT_URL
    });
}
