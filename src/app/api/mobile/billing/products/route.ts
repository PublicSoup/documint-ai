import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse, successResponse } from "@/lib/api-utils";
import { enforceRateLimit } from "@/lib/rate-limit";
import { IAP_PRODUCTS } from "@/lib/iap/products";
import { PLANS } from "@/config/plans";

/**
 * GET /api/mobile/billing/products
 * The store product ids the mobile app should query from StoreKit / Play
 * Billing, joined with the marketing plan metadata already defined for web
 * (src/config/plans.ts) so the mobile paywall shows names/features without a
 * second source of truth. Actual localized prices come from the store SDK on
 * the device, not from here.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();

        await enforceRateLimit(session.user.id, "api");

        const products = IAP_PRODUCTS.map(({ productId, plan }) => {
            const meta = PLANS.find((p) => p.id === plan);
            return {
                productId,
                plan,
                name: meta?.name ?? plan,
                description: meta?.description ?? "",
                features: meta?.features ?? [],
            };
        });

        return successResponse({ products });
    } catch (error) {
        return errorResponse(error);
    }
}
