/**
 * Runtime platform detection for the DocuMint IDE.
 *
 * The IDE has two code-execution backends:
 *   1. WebContainer  — an in-browser Node runtime (StackBlitz). It requires
 *      SharedArrayBuffer + cross-origin isolation (COOP/COEP), which desktop
 *      browsers provide but iOS/Android WebViews (WKWebView / Android System
 *      WebView) do NOT reliably grant. It is therefore unusable inside a
 *      Capacitor native shell.
 *   2. Vercel Sandbox — a server-side runtime reached over HTTPS. It works from
 *      any client, including a phone.
 *
 * On a phone we must always take path (2). This module centralizes that
 * decision so both the execution engine and any UI affordances agree.
 */

/**
 * Minimal shapes for the Capacitor plugins we use. We deliberately do NOT import
 * the `@capacitor/*` npm packages into the web app — they live only in the
 * `mobile/` workspace, and importing them here would break the Vercel build. In
 * the native shell Capacitor exposes registered plugins on
 * `window.Capacitor.Plugins`, so we call them through that global with these
 * hand-written types.
 */
type CapacitorPlugins = {
  App?: {
    addListener: (
      eventName: "appUrlOpen",
      listener: (data: { url: string }) => void,
    ) => { remove: () => void } | Promise<{ remove: () => void }>;
  };
  Browser?: {
    open: (options: { url: string }) => Promise<void>;
    close?: () => Promise<void>;
  };
  StatusBar?: {
    setStyle?: (options: { style: string }) => Promise<void>;
  };
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  isNative?: boolean;
  getPlatform?: () => string;
  platform?: string;
  Plugins?: CapacitorPlugins;
};

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Registered native plugins, or undefined off-device. */
export function getCapacitorPlugins(): CapacitorPlugins | undefined {
  return getCapacitor()?.Plugins;
}

/**
 * Open a URL in the device's SYSTEM browser (SFSafariViewController / Chrome
 * Custom Tab) instead of the app WebView. Required for OAuth: Google refuses
 * embedded WebViews, and the whole sign-in flow (including NextAuth's state
 * cookies) must live in one real-browser context. Falls back to a normal
 * navigation if the Browser plugin isn't present.
 */
export async function openInSystemBrowser(url: string): Promise<void> {
  const browser = getCapacitorPlugins()?.Browser;
  if (browser) {
    await browser.open({ url });
    return;
  }
  if (typeof window !== "undefined") window.location.assign(url);
}

/**
 * True when running inside a Capacitor native shell (iOS or Android).
 * Supports both the modern `isNativePlatform()` API and the legacy
 * `isNative` boolean.
 */
export function isNativePlatform(): boolean {
  const cap = getCapacitor();
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  return Boolean(cap.isNative);
}

/** "ios" | "android" | "web" — best-effort, defaults to "web". */
export function getPlatform(): "ios" | "android" | "web" {
  const cap = getCapacitor();
  const raw =
    (typeof cap?.getPlatform === "function" ? cap.getPlatform() : cap?.platform) ??
    "web";
  return raw === "ios" || raw === "android" ? raw : "web";
}

/**
 * Escape hatch so the server-runtime path can be exercised from a regular
 * desktop browser (where Capacitor is absent) during development and the
 * automated verification workflow — no device or emulator required.
 *
 * Enable with either:
 *   - the URL query param `?serverRuntime=1`, or
 *   - `localStorage["documint:server-runtime"] === "1"`.
 */
function serverRuntimeForced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("serverRuntime") === "1") return true;
    return window.localStorage?.getItem("documint:server-runtime") === "1";
  } catch {
    return false;
  }
}

/**
 * The single question the execution engine asks: should this client run code on
 * the server sandbox instead of the in-browser WebContainer? True on any native
 * phone shell, or when the developer override is active.
 */
export function shouldUseServerRuntime(): boolean {
  return isNativePlatform() || serverRuntimeForced();
}
