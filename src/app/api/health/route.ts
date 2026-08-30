import { NextResponse } from "next/server";

/**
 * Liveness probe for the platform healthcheck (Railway `/api/health`).
 *
 * Deliberately dependency-free: it does NOT import env validation, hit the DB,
 * ping Redis, or rate-limit. A healthcheck should answer one question — "is the
 * web process up and serving HTTP?" — and return 200 whenever it is. Coupling it
 * to downstream services (as the old version did, returning 503 on a DB blip and
 * importing the throw-on-missing env module) meant a degraded dependency or an
 * unset env var failed the whole deployment and took the site down. Readiness of
 * individual services is reported by their own routes, not here.
 */
export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json(
        {
            status: "ok",
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
        },
        { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
}
