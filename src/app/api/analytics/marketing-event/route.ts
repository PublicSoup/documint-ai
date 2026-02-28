import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit, getClientIP } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import {
  MARKETING_EVENT_NAMES,
  MARKETING_LOCATION_TOKENS,
  MARKETING_LOCATION_PREFIXES,
  MARKETING_VARIANT_PREFIXES,
  MARKETING_SESSION_HINT_PREFIXES,
} from "@/lib/marketing-events";

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REJECTION_ISSUES_LOGGED = 10;

function isAllowedLocationToken(location: string): boolean {
  if (MARKETING_LOCATION_TOKENS.includes(location as any)) {
    return true;
  }

  return MARKETING_LOCATION_PREFIXES.some((prefix) => location.startsWith(prefix));
}

function isAllowedVariantToken(variant: string | undefined): boolean {
  if (!variant) return true;
  if (variant === "control") return true;

  return MARKETING_VARIANT_PREFIXES.some((prefix) => variant.startsWith(prefix));
}

function isAllowedSessionHintToken(sessionHint: string | undefined): boolean {
  if (!sessionHint) return true;

  return MARKETING_SESSION_HINT_PREFIXES.some((prefix) => sessionHint.startsWith(prefix));
}

async function logRejectedMarketingEvent(params: {
  ip: string | null | undefined;
  entityId: "invalid_json" | "invalid_payload";
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await logAudit({
      action: "MARKETING_EVENT_REJECTED",
      entity: "LandingPage",
      entityId: params.entityId,
      userId: null,
      ip: params.ip,
      details: params.details,
    });
  } catch {
    // non-blocking
  }
}

function maskIpAddress(ip: string | null | undefined): string | null | undefined {
  if (!ip) return ip;

  if (ip.includes(".")) {
    return ip.split(".").slice(0, 3).join(".") + ".x";
  }

  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean);
    if (groups.length <= 2) return ip;
    return groups.slice(0, 2).join(":") + "::x";
  }

  return ip;
}

const marketingEventSchema = z.object({
  eventName: z.enum(MARKETING_EVENT_NAMES),
  location: z.string().trim().min(1).max(120)
    .regex(/^[a-z0-9_\-]+$/, "location must be lowercase snake/kebab token")
    .refine(isAllowedLocationToken, "location is not in allowlist"),
  href: z.string().trim().min(1).max(500).refine((value) => {
    if (value.startsWith("/")) {
      return /^\/[^\s]*$/.test(value);
    }

    try {
      const parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && !/\s/.test(value);
    } catch {
      return false;
    }
  }, {
    message: "href must be a whitespace-free relative path or valid http(s) URL",
  }),
  variant: z.string().trim().min(1).max(64)
    .regex(/^[a-z0-9_\-]+$/, "variant must be lowercase snake/kebab token")
    .optional()
    .refine(isAllowedVariantToken, "variant is not in allowlist"),
  sessionHint: z.string().trim().min(1).max(128)
    .regex(/^[a-zA-Z0-9_\-:.]+$/, "sessionHint contains unsupported characters")
    .optional()
    .refine(isAllowedSessionHintToken, "sessionHint is not in allowlist"),
  ts: z.number().int().positive().optional().refine(
    (value) => value === undefined || value <= Date.now() + MAX_FUTURE_SKEW_MS,
    "ts is too far in the future",
  ).refine(
    (value) => value === undefined || value >= Date.now() - MAX_EVENT_AGE_MS,
    "ts is too old",
  ),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const ip = await getClientIP(req);
    const maskedIp = maskIpAddress(ip);
    await enforceRateLimit(`marketing:${ip}`, "api");

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      await logRejectedMarketingEvent({
        ip: maskedIp,
        entityId: "invalid_json",
        details: { reason: "invalid_json" },
      });

      return errorResponse(ApiErrors.badRequest("Invalid JSON body"));
    }

    const parsedBody = marketingEventSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      await logRejectedMarketingEvent({
        ip: maskedIp,
        entityId: "invalid_payload",
        details: {
          reason: "schema_validation_failed",
          issues: parsedBody.error.issues.slice(0, MAX_REJECTION_ISSUES_LOGGED).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
          issueCount: parsedBody.error.issues.length,
        },
      });

      return errorResponse(ApiErrors.badRequest("Invalid marketing event payload", parsedBody.error.flatten()));
    }

    const { eventName, location, href, variant, sessionHint, ts } = parsedBody.data;

    try {
      await logAudit({
        action: "MARKETING_EVENT",
        entity: "LandingPage",
        entityId: location,
        userId: null,
        ip: maskedIp,
        details: {
          eventName,
          location,
          href,
          variant,
          sessionHint,
          occurredAtMs: ts ?? Date.now(),
        },
      });
    } catch {
      // keep ingestion non-blocking if audit logging is unavailable
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
