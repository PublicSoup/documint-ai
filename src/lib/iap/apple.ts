import { env } from "@/lib/env";
import { IapNotConfiguredError, IapVerificationError, type VerifiedPurchase } from "./types";

const PRODUCTION_VERIFY_URL = "https://buy.itunes.apple.com/verifyReceipt";
const SANDBOX_VERIFY_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

// Apple's documented "this receipt is from the test environment" status —
// the canonical signal to retry against sandbox after hitting production.
const SANDBOX_RECEIPT_STATUS = 21007;

interface AppleLatestReceiptInfo {
    product_id?: string;
    expires_date_ms?: string;
    original_transaction_id?: string;
    purchase_date_ms?: string;
}

interface AppleVerifyResponse {
    status: number;
    environment?: string;
    latest_receipt_info?: AppleLatestReceiptInfo[];
}

/**
 * Verifies an App Store receipt via the classic `verifyReceipt` endpoint.
 * The Flutter `in_app_purchase` plugin surfaces exactly this base64 receipt
 * as `PurchaseDetails.verificationData.serverVerificationData` on iOS, which
 * is why this (rather than the transaction-id-based App Store Server API) is
 * the natural fit for that client. Hardening to the App Store Server API
 * with server notifications is a documented follow-up.
 */
export async function verifyAppleReceipt(receiptData: string): Promise<VerifiedPurchase> {
    if (!env.APPLE_IAP_SHARED_SECRET) {
        throw new IapNotConfiguredError("apple");
    }

    const response = await callVerifyReceipt(receiptData, PRODUCTION_VERIFY_URL);
    const finalResponse = response.status === SANDBOX_RECEIPT_STATUS
        ? await callVerifyReceipt(receiptData, SANDBOX_VERIFY_URL)
        : response;

    if (finalResponse.status !== 0) {
        throw new IapVerificationError(`Apple verifyReceipt returned status ${finalResponse.status}`);
    }

    const latest = pickLatestEntry(finalResponse.latest_receipt_info);
    if (!latest?.product_id || !latest.original_transaction_id) {
        throw new IapVerificationError("Apple receipt contained no subscription transaction.");
    }

    const expiresAt = latest.expires_date_ms ? new Date(Number(latest.expires_date_ms)) : null;

    return {
        productId: latest.product_id,
        originalTransactionId: latest.original_transaction_id,
        expiresAt,
        isActive: expiresAt ? expiresAt.getTime() > Date.now() : false,
        environment: finalResponse.environment === "Sandbox" ? "sandbox" : "production",
    };
}

async function callVerifyReceipt(receiptData: string, url: string): Promise<AppleVerifyResponse> {
    let res: Response;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                "receipt-data": receiptData,
                password: env.APPLE_IAP_SHARED_SECRET,
                "exclude-old-transactions": true,
            }),
        });
    } catch (error) {
        throw new IapVerificationError("Failed to reach Apple verifyReceipt.", error);
    }

    if (!res.ok) {
        throw new IapVerificationError(`Apple verifyReceipt HTTP ${res.status}`);
    }

    return (await res.json()) as AppleVerifyResponse;
}

/** The subscription entry with the furthest-out expiry is the current one. */
function pickLatestEntry(entries?: AppleLatestReceiptInfo[]): AppleLatestReceiptInfo | null {
    if (!entries || entries.length === 0) return null;
    return entries.reduce((latest, entry) => {
        const entryMs = Number(entry.expires_date_ms ?? 0);
        const latestMs = Number(latest.expires_date_ms ?? 0);
        return entryMs > latestMs ? entry : latest;
    });
}
