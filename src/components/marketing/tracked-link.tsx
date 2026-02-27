"use client";

import Link from "next/link";
import { ReactNode, MouseEvent } from "react";

interface TrackedLinkProps {
  href: string;
  eventName: string;
  location: string;
  children: ReactNode;
  className?: string;
  target?: "_blank" | "_self";
}

function trackMarketingEvent(eventName: string, location: string, href: string): void {
  const payload = JSON.stringify({
    eventName,
    location,
    href,
    ts: Date.now(),
  });

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/marketing-event", blob);
    return;
  }

  void fetch("/api/analytics/marketing-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  });
}

export function TrackedLink({ href, eventName, location, children, className, target = "_self" }: TrackedLinkProps) {
  const handleClick = (_event: MouseEvent<HTMLAnchorElement>): void => {
    trackMarketingEvent(eventName, location, href);
  };

  return (
    <Link href={href} className={className} target={target} onClick={handleClick} prefetch={false}>
      {children}
    </Link>
  );
}
