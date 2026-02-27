import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";

const marketingEventSchema = z.object({
  eventName: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(120),
  href: z.string().trim().min(1).max(500),
  ts: z.number().int().positive().optional(),
}).strict();

const ALLOWED_EVENTS = new Set([
  "landing_primary_cta_click",
  "landing_secondary_cta_click",
  "landing_pricing_cta_click",
  "landing_final_cta_click",
]);

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIP(req);
    await enforceRateLimit(`marketing:${ip}`, "api");

    const parsedBody = marketingEventSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { eventName, location, href, ts } = parsedBody.data;
    if (!ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
    }

    await logAudit({
      action: "MARKETING_EVENT",
      entity: "LandingPage",
      entityId: location,
      userId: null,
      ip,
      details: {
        eventName,
        location,
        href,
        occurredAtMs: ts ?? Date.now(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
