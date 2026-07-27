import type { PlanType } from "@/config/plans";

/**
 * Canonical mapping of store product identifiers to DocuMint plans. These
 * exact ids must be created as auto-renewable subscription products in BOTH
 * App Store Connect and the Google Play Console (see mobile/IAP_SETUP.md).
 * Keeping one shared id per plan across both stores keeps this table — and
 * the mobile client's product query — simple.
 *
 * Only paid plans are sold via IAP; "free" is the absence of a subscription.
 */
export const IAP_PRODUCTS: Array<{ productId: string; plan: Exclude<PlanType, "free"> }> = [
    { productId: "dev.documintai.sub.starter.monthly", plan: "starter" },
    { productId: "dev.documintai.sub.pro.monthly", plan: "pro" },
    { productId: "dev.documintai.sub.team.monthly", plan: "team" },
];

const PRODUCT_TO_PLAN = new Map<string, Exclude<PlanType, "free">>(
    IAP_PRODUCTS.map((p) => [p.productId, p.plan]),
);

export function planForProductId(productId: string): Exclude<PlanType, "free"> | null {
    return PRODUCT_TO_PLAN.get(productId) ?? null;
}

export function isKnownProductId(productId: string): boolean {
    return PRODUCT_TO_PLAN.has(productId);
}
