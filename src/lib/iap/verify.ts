import { db } from "@/lib/db";
import type { PlanType } from "@/config/plans";
import { verifyAppleReceipt } from "./apple";
import { verifyGooglePurchase } from "./google";
import { planForProductId } from "./products";
import { IapVerificationError, type VerifiedPurchase } from "./types";

export type IapPlatform = "apple" | "google";

export interface IapVerifyResult {
    plan: PlanType;
    status: string;
    isActive: boolean;
    expiresAt: Date | null;
}

/**
 * Verifies a mobile in-app purchase with the relevant store and writes the
 * result onto the user's single `Subscription` row, reusing the same
 * plan/status/currentPeriodEnd columns the Stripe flow uses so
 * getUserSubscription() needs no changes. Idempotent per store subscription
 * via the unique `iapOriginalTransactionId`: re-verifying the same purchase
 * (app relaunch, restore, renewal re-check) updates in place rather than
 * duplicating, and a purchase is never stolen from another account.
 */
export async function verifyAndApplyPurchase(params: {
    userId: string;
    platform: IapPlatform;
    productId: string;
    verificationData: string;
}): Promise<IapVerifyResult> {
    const { userId, platform, productId, verificationData } = params;

    const plan = planForProductId(productId);
    if (!plan) {
        throw new IapVerificationError(`Unknown product id: ${productId}`);
    }

    const verified: VerifiedPurchase = platform === "apple"
        ? await verifyAppleReceipt(verificationData)
        : await verifyGooglePurchase(productId, verificationData);

    // The plan is authoritative from the *verified* product id, not the
    // client-claimed one — a tampered client can't upgrade itself by lying
    // about which product it bought.
    const verifiedPlan = planForProductId(verified.productId) ?? plan;

    // Guard against a purchase being attached to two accounts: if this store
    // subscription is already bound to a different user, refuse.
    const existingForTxn = await db.subscription.findUnique({
        where: { iapOriginalTransactionId: verified.originalTransactionId },
        select: { userId: true },
    });
    if (existingForTxn && existingForTxn.userId !== userId) {
        throw new IapVerificationError("This purchase is already linked to another account.");
    }

    const status = verified.isActive ? "active" : "expired";

    await db.subscription.upsert({
        where: { userId },
        create: {
            userId,
            plan: verifiedPlan,
            status,
            currentPeriodEnd: verified.expiresAt,
            cancelAtPeriodEnd: false,
            iapPlatform: platform,
            iapProductId: verified.productId,
            iapOriginalTransactionId: verified.originalTransactionId,
            iapPurchaseToken: platform === "google" ? verificationData : null,
            iapExpiresAt: verified.expiresAt,
        },
        update: {
            plan: verifiedPlan,
            status,
            currentPeriodEnd: verified.expiresAt,
            iapPlatform: platform,
            iapProductId: verified.productId,
            iapOriginalTransactionId: verified.originalTransactionId,
            iapPurchaseToken: platform === "google" ? verificationData : null,
            iapExpiresAt: verified.expiresAt,
        },
    });

    return { plan: verifiedPlan, status, isActive: verified.isActive, expiresAt: verified.expiresAt };
}
