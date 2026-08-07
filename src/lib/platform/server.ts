/**
 * Server-side detection of the DocuMint native shell (Capacitor iOS/Android).
 *
 * The shell appends the token "DocuMintApp" to its WebView User-Agent via
 * `appendUserAgent` in mobile/capacitor.config.ts. This is the server-side mirror
 * of the client-side `isNativePlatform()` in ./native.ts, used where only the
 * request headers are available (middleware, server components, route handlers).
 */

export const NATIVE_APP_UA_TOKEN = "DocuMintApp";

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
    return (userAgent ?? "").includes(NATIVE_APP_UA_TOKEN);
}
