"use client";

import { useSyncExternalStore } from "react";
import { isNativePlatform } from "@/lib/platform/native";

// Capacitor is only detectable in the browser. useSyncExternalStore lets the
// server/hydration snapshot be `false` while the client resolves the real value,
// avoiding both a hydration mismatch and a setState-in-effect.
const subscribe = () => () => {};
const getClientSnapshot = () => isNativePlatform();
const getServerSnapshot = () => false;

/**
 * Client hook: true when running inside the Capacitor native shell.
 *
 * Used to suppress in-app purchase/upgrade surfaces on iOS/Android, where Apple
 * (guideline 3.1.1) forbids selling or linking to web checkout for the digital
 * subscription. Users subscribe on the web; the app only unlocks what they own.
 */
export function useIsNativeApp(): boolean {
    return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
