import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json({ error: "Deprecated. Use IDE Run feature instead." }, { status: 410 });
}
