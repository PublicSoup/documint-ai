import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { OPENROUTER_BASE_URL } from "@/lib/ai-usage";

/**
 * GET /api/openrouter/models
 *
 * Proxies OpenRouter's public model catalog so the model picker can list what's
 * currently available. Fetched server-side to sidestep browser CORS and to
 * trim the (large) payload down to what the UI needs. No key required —
 * OpenRouter's /models endpoint is public.
 */

interface OpenRouterModel {
    id: string;
    name: string;
    contextLength: number | null;
    promptPrice: number | null;
    completionPrice: number | null;
}

interface RawModel {
    id?: unknown;
    name?: unknown;
    context_length?: unknown;
    pricing?: { prompt?: unknown; completion?: unknown };
}

function toNumber(value: unknown): number | null {
    const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
    return Number.isFinite(n) ? n : null;
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        await enforceRateLimit(session.user.id, "api");

        const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(10_000),
            // Cache at the platform edge for an hour — the catalog changes slowly.
            next: { revalidate: 3600 },
        });

        if (!res.ok) {
            return errorResponse(ApiErrors.serviceUnavailable("OpenRouter model catalog"));
        }

        const data = (await res.json()) as { data?: RawModel[] };
        const models: OpenRouterModel[] = (data.data ?? [])
            .filter((m): m is RawModel & { id: string } => typeof m.id === "string" && m.id.length > 0)
            .map((m) => ({
                id: m.id,
                name: typeof m.name === "string" && m.name ? m.name : m.id,
                contextLength: toNumber(m.context_length),
                promptPrice: toNumber(m.pricing?.prompt),
                completionPrice: toNumber(m.pricing?.completion),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ models }, {
            headers: { "Cache-Control": "private, max-age=1800" },
        });
    } catch (error) {
        return errorResponse(error);
    }
}
