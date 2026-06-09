export type OAuthProviderId = "google" | "github";

const OAUTH_PROVIDER_IDS = new Set<OAuthProviderId>(["google", "github"]);
const QUEUED_PROVIDER_PARAM = "oauthProvider";

interface CsrfResponse {
    csrfToken?: unknown;
}

interface SignInResponse {
    url?: unknown;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 10_000): Promise<Response> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        window.clearTimeout(timeout);
    }
}

function getString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function getCanonicalOrigin(): string {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)) {
        return window.location.origin;
    }

    if (configuredUrl) {
        try {
            return new URL(configuredUrl).origin;
        } catch {
            // Fall through to the browser origin when the public app URL is malformed.
        }
    }

    return window.location.origin;
}

function isOAuthProviderId(value: string | null): value is OAuthProviderId {
    return value !== null && OAUTH_PROVIDER_IDS.has(value as OAuthProviderId);
}

function buildAbsoluteCallbackUrl(callbackUrl: string, origin: string): string {
    return new URL(callbackUrl, origin).toString();
}

function redirectToCanonicalOrigin(providerId: OAuthProviderId): boolean {
    const canonicalOrigin = getCanonicalOrigin();

    if (window.location.origin === canonicalOrigin) {
        return false;
    }

    const canonicalUrl = new URL(window.location.href);
    const originUrl = new URL(canonicalOrigin);
    canonicalUrl.protocol = originUrl.protocol;
    canonicalUrl.host = originUrl.host;
    canonicalUrl.searchParams.set(QUEUED_PROVIDER_PARAM, providerId);

    window.location.assign(canonicalUrl.toString());
    return true;
}

export function consumeQueuedOAuthProvider(): OAuthProviderId | null {
    const url = new URL(window.location.href);
    const providerId = url.searchParams.get(QUEUED_PROVIDER_PARAM);

    if (!isOAuthProviderId(providerId)) {
        return null;
    }

    url.searchParams.delete(QUEUED_PROVIDER_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    return providerId;
}

export async function startOAuthRedirect(providerId: OAuthProviderId, callbackUrl: string): Promise<void> {
    if (redirectToCanonicalOrigin(providerId)) {
        return;
    }

    const canonicalOrigin = getCanonicalOrigin();
    const absoluteCallbackUrl = buildAbsoluteCallbackUrl(callbackUrl, canonicalOrigin);

    const csrfResponse = await fetchWithTimeout(`${canonicalOrigin}/api/auth/csrf`, {
        cache: "no-store",
        credentials: "same-origin",
    });

    if (!csrfResponse.ok) {
        throw new Error(`Unable to read auth CSRF token (${csrfResponse.status}).`);
    }

    const csrfJson = await csrfResponse.json() as CsrfResponse;
    const csrfToken = getString(csrfJson.csrfToken);

    if (!csrfToken) {
        throw new Error("Auth CSRF token was missing.");
    }

    const signInResponse = await fetchWithTimeout(`${canonicalOrigin}/api/auth/signin/${providerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "same-origin",
        body: new URLSearchParams({
            csrfToken,
            callbackUrl: absoluteCallbackUrl,
            json: "true",
        }),
    });

    if (!signInResponse.ok) {
        throw new Error(`OAuth sign-in failed to start (${signInResponse.status}).`);
    }

    const signInJson = await signInResponse.json() as SignInResponse;
    const redirectUrl = getString(signInJson.url);

    if (!redirectUrl) {
        throw new Error("OAuth provider redirect URL was missing.");
    }

    window.location.assign(redirectUrl);
}