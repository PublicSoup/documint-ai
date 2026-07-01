/**
 * Cross-Origin-Embedder-Policy mode selection.
 *
 * WebContainers need a cross-origin-isolated context (crossOriginIsolated +
 * SharedArrayBuffer), which requires a COEP header the browser actually honors:
 *
 *   - `credentialless` — supported by Chromium (Chrome/Edge/Opera/Brave) and
 *     Firefox 119+. Lets WebContainer's preview iframe embed without every
 *     sub-resource needing CORP, so it's the nicest mode where it's available.
 *   - `require-corp`   — honored by ALL modern browsers (including Safari/WebKit,
 *     which does NOT support `credentialless`). Stricter about cross-origin
 *     sub-resources, but the WebContainer runtime/preview send matching COEP when
 *     booted with the same mode, so isolation works everywhere.
 *
 * The value returned here MUST be used for BOTH the COEP response header on /code
 * (see src/proxy.ts) AND the `coep` option passed to WebContainer.boot()
 * (see src/lib/web-container.ts). A mismatch corrupts the isolated context and
 * makes boot hang/fail.
 */
export type CoepMode = "credentialless" | "require-corp";

/**
 * Pick the COEP mode that grants cross-origin isolation in the given browser.
 *
 * Note the regexes are token-anchored (`Chrome/`, `Firefox/`) so iOS browsers —
 * which are WebKit under the hood and report `CriOS`/`FxiOS`/`EdgiOS` — correctly
 * fall through to `require-corp` rather than being mistaken for desktop Chromium.
 */
export function coepForUserAgent(userAgent: string | null | undefined): CoepMode {
  const ua = userAgent ?? "";
  const supportsCredentialless =
    /\b(?:Chrome|Chromium|Edg|OPR|Brave)\/\d/.test(ua) || /\bFirefox\/\d/.test(ua);
  return supportsCredentialless ? "credentialless" : "require-corp";
}
