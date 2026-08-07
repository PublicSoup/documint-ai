"use client";

import { useEffect } from "react";

/**
 * Fires the custom-scheme deep link to reopen the DocuMint app and hand the
 * session token back to its WebView. Custom-scheme navigation is more reliable via
 * a JS location assignment / user tap than a 302 Location header, so we do both a
 * best-effort auto-redirect and a manual fallback link.
 */
export default function NativeHandoffRedirect({ deepLink }: { deepLink: string }) {
    useEffect(() => {
        const timer = window.setTimeout(() => {
            window.location.href = deepLink;
        }, 250);
        return () => window.clearTimeout(timer);
    }, [deepLink]);

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "20px",
                padding: "24px",
                background: "#030014",
                color: "#e6e8ee",
                fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                textAlign: "center",
            }}
        >
            <div style={{ fontSize: "22px", fontWeight: 700 }}>
                Returning to DocuMint…
            </div>
            <div style={{ fontSize: "14px", color: "#9aa0ad", maxWidth: "320px" }}>
                You&rsquo;re signed in. If the app doesn&rsquo;t reopen automatically,
                tap the button below.
            </div>
            <a
                href={deepLink}
                style={{
                    marginTop: "8px",
                    background: "#6366f1",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "15px",
                    padding: "12px 24px",
                    borderRadius: "12px",
                    textDecoration: "none",
                }}
            >
                Open DocuMint
            </a>
        </div>
    );
}
