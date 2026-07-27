import { createSign } from "crypto";
import { env } from "@/lib/env";
import { IapNotConfiguredError, IapVerificationError, type VerifiedPurchase } from "./types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

interface ServiceAccount {
    client_email: string;
    private_key: string;
}

interface SubscriptionV2LineItem {
    productId?: string;
    expiryTime?: string;
}

interface SubscriptionPurchaseV2 {
    subscriptionState?: string;
    lineItems?: SubscriptionV2LineItem[];
}

// Short in-process cache of the OAuth access token so we don't mint a fresh
// JWT + round-trip to Google on every single verify call.
let cachedToken: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount {
    if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || !env.GOOGLE_PLAY_PACKAGE_NAME) {
        throw new IapNotConfiguredError("google");
    }

    try {
        const parsed = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) as ServiceAccount;
        if (!parsed.client_email || !parsed.private_key) {
            throw new Error("missing client_email/private_key");
        }
        return parsed;
    } catch (error) {
        throw new IapVerificationError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid service-account JSON.", error);
    }
}

function base64url(input: Buffer | string): string {
    return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Standard service-account OAuth2: sign a JWT, exchange it for an access token. */
async function getAccessToken(account: ServiceAccount): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
        return cachedToken.token;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(JSON.stringify({
        iss: account.client_email,
        scope: ANDROID_PUBLISHER_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
    }));

    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const signature = base64url(signer.sign(account.private_key));
    const assertion = `${header}.${claims}.${signature}`;

    let res: Response;
    try {
        res = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion,
            }),
        });
    } catch (error) {
        throw new IapVerificationError("Failed to reach Google's OAuth token endpoint.", error);
    }

    if (!res.ok) {
        throw new IapVerificationError(`Google OAuth token exchange failed (HTTP ${res.status}).`);
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
        throw new IapVerificationError("Google OAuth token exchange returned no access token.");
    }

    cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return json.access_token;
}

/**
 * Verifies a Google Play subscription purchase token via the Android
 * Publisher API (`purchases.subscriptionsv2`). The Flutter `in_app_purchase`
 * plugin surfaces this token as `serverVerificationData` on Android. The
 * purchase token is stable across auto-renewals, so it doubles as the stable
 * per-subscription identifier.
 */
export async function verifyGooglePurchase(productId: string, purchaseToken: string): Promise<VerifiedPurchase> {
    const account = loadServiceAccount();
    const accessToken = await getAccessToken(account);
    const packageName = env.GOOGLE_PLAY_PACKAGE_NAME!;

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

    let res: Response;
    try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (error) {
        throw new IapVerificationError("Failed to reach the Google Play Developer API.", error);
    }

    if (!res.ok) {
        throw new IapVerificationError(`Google Play purchase lookup failed (HTTP ${res.status}).`);
    }

    const purchase = (await res.json()) as SubscriptionPurchaseV2;
    const lineItem = purchase.lineItems?.find((item) => item.productId === productId) ?? purchase.lineItems?.[0];
    const expiresAt = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
    const state = purchase.subscriptionState ?? "";
    const isActive = state === "SUBSCRIPTION_STATE_ACTIVE" || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";

    return {
        productId: lineItem?.productId ?? productId,
        originalTransactionId: purchaseToken,
        expiresAt,
        isActive,
        environment: "production",
    };
}
