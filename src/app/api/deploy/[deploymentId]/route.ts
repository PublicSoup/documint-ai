import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({ error: "Deprecated. Use IDE Run feature instead." }, { status: 410 });
}
