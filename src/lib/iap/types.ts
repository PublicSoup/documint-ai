/**
 * Normalized result of verifying a store purchase, independent of platform.
 * `isActive` reflects whether the subscription is currently entitled (not
 * expired), so callers can flip the DB `status` between active/inactive.
 */
export interface VerifiedPurchase {
    productId: string;
    /** Stable per-subscription identifier used to de-dupe renewals. */
    originalTransactionId: string;
    expiresAt: Date | null;
    isActive: boolean;
    environment: "production" | "sandbox";
}

export class IapVerificationError extends Error {
    constructor(message: string, readonly cause?: unknown) {
        super(message);
        this.name = "IapVerificationError";
    }
}

/** Thrown when the relevant store credentials are not configured on the server. */
export class IapNotConfiguredError extends Error {
    constructor(platform: "apple" | "google") {
        super(`${platform === "apple" ? "Apple" : "Google Play"} in-app purchases are not configured on the server.`);
        this.name = "IapNotConfiguredError";
    }
}
