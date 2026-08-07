"use client";

import { useEffect } from "react";
import { getCapacitorPlugins, isNativePlatform } from "@/lib/platform/native";

/**
 * App-wide native glue for the Capacitor shell (renders nothing). Registers the
 * deep-link handler that completes the OAuth hand-off: when the system browser
 * fires `documintai://auth/callback?token=…`, the OS reopens the app and we
 * navigate the WebView to the exchange endpoint, which sets the session cookie
 * here (see src/lib/native-auth.ts). Also applies dark status-bar styling.
 *
 * All plugins are accessed via the runtime `window.Capacitor.Plugins` global — we
 * never import `@capacitor/*` into the web bundle.
 */
export default function NativeBridge() {
    useEffect(() => {
        if (!isNativePlatform()) return;
        const plugins = getCapacitorPlugins();

        void plugins?.StatusBar?.setStyle?.({ style: "DARK" }).catch(() => undefined);

        let remove: (() => void) | undefined;
        void plugins?.App?.addListener("appUrlOpen", (data) => {
            if (!data?.url || !data.url.includes("auth/callback")) return;
            try {
                const token = new URL(data.url).searchParams.get("token");
                if (!token) return;
                void plugins?.Browser?.close?.().catch(() => undefined);
                window.location.href = `/api/auth/native-exchange?token=${encodeURIComponent(token)}`;
            } catch {
                // Ignore malformed deep links.
            }
        })
            .then((handle) => {
                remove = handle.remove;
            })
            .catch(() => undefined);

        return () => remove?.();
    }, []);

    return null;
}
