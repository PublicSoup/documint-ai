import type { CapacitorConfig } from "@capacitor/cli";

/**
 * DocuMint runs as a server-rendered Next.js app (API routes, NextAuth, Prisma),
 * so it cannot be statically exported into the native bundle. Instead the native
 * shell loads the hosted deployment directly — the standard Capacitor pattern for
 * SSR frameworks.
 *
 * `server.url` points at the live site (override per-environment with the
 * CAP_SERVER_URL env var, e.g. a preview deployment or a LAN dev server). The
 * local `www/` directory is only the offline fallback shown when the site is
 * unreachable.
 *
 * NOTE: In-IDE code execution is routed to the server-side Vercel Sandbox on
 * native platforms (see src/lib/platform/native.ts) because the in-browser
 * WebContainer runtime cannot start inside an iOS/Android WebView.
 */
const config: CapacitorConfig = {
  appId: "dev.documintai.app",
  appName: "DocuMint",
  webDir: "www",
  server: {
    url: process.env.CAP_SERVER_URL || "https://www.documintai.dev",
    cleartext: false,
    // Domains the WebView may navigate to at the top level. The hosted origin is
    // implied by server.url; add sandbox/preview origins here if the app ever
    // navigates to them as a full page (iframes are not restricted by this list).
    allowNavigation: ["www.documintai.dev", "documintai.dev"],
  },
  ios: {
    contentInset: "always",
    // Tag the WebView UA so the server can detect the native shell (see
    // src/lib/platform/server.ts). Drives: skipping cross-origin isolation on
    // /code (so the sandbox preview iframe loads) and hiding in-app purchase UI.
    appendUserAgent: "DocuMintApp",
  },
  android: {
    // Allow https only; the hosted app and sandbox previews are always TLS.
    allowMixedContent: false,
    appendUserAgent: "DocuMintApp",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#0b0e14",
      showSpinner: false,
    },
    // Resize the WebView (not the body) when the keyboard opens so the Monaco
    // editor + terminal stay visible while typing on a phone/iPad.
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
