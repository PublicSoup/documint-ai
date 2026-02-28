"use client";

import Link from "next/link";
import { ReactNode, MouseEvent } from "react";
import { MARKETING_SESSION_HINT_PREFIXES } from "@/lib/marketing-events";

interface TrackedLinkProps {
  href: string;
  eventName: string;
  location: string;
  children: ReactNode;
  className?: string;
  target?: "_blank" | "_self";
  rel?: string;
  variant?: string;
  sessionHint?: string;
}

function getOrCreateSessionHint(explicitSessionHint?: string): string | undefined {
  if (explicitSessionHint) return explicitSessionHint;
  if (typeof window === "undefined") return undefined;

  const key = "documint:marketing-session-hint";

  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;

    const prefix = MARKETING_SESSION_HINT_PREFIXES[0];
    const generated = `${prefix}${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    window.localStorage.setItem(key, generated);
    return generated;
  } catch {
    return undefined;
  }
}

function trackMarketingEvent(
  eventName: string,
  location: string,
  href: string,
  variant?: string,
  sessionHint?: string,
): void {
  const resolvedSessionHint = getOrCreateSessionHint(sessionHint);

  const payload = JSON.stringify({
    eventName,
    location,
    href,
    variant,
    sessionHint: resolvedSessionHint,
    ts: Date.now(),
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/analytics/marketing-event", blob);
      if (sent) {
        return;
      }
    } catch {
      // Fall through to fetch transport.
    }
  }

  void fetch("/api/analytics/marketing-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Non-blocking analytics transport failure.
  });
}

export function TrackedLink({
  href,
  eventName,
  location,
  children,
  className,
  target = "_self",
  rel,
  variant,
  sessionHint,
}: TrackedLinkProps) {
  const handleClick = (_event: MouseEvent<HTMLAnchorElement>): void => {
    trackMarketingEvent(eventName, location, href, variant, sessionHint);
  };

  const resolvedRel = (() => {
    if (target !== "_blank") return rel;

    const relTokens = new Set((rel ?? "").split(" ").filter(Boolean));
    relTokens.add("noopener");
    relTokens.add("noreferrer");

    return Array.from(relTokens).join(" ");
  })();

  return (
    <Link
      href={href}
      className={className}
      target={target}
      rel={resolvedRel}
      onClick={handleClick}
      prefetch={false}
    >
      {children}
    </Link>
  );
}
