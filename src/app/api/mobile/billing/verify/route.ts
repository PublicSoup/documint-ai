import { getServerSession } from "next-auth";
import { z } from "zod";
import { AuditLogSeverity } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { ApiErrors, errorResponse, successResponse, validateBody } from "@/lib/api-utils";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit-logger";
import { verifyAndApplyPurchase } from "@/lib/iap/verify";
import { IapNotConfiguredError, IapVerificationError } from "@/lib/iap/types";
import { isKnownProductId } from "@/lib/iap/products";

const verifySchema = z
    .object({
        platform: z.enum(["apple", "google"]),
        productId: z.string().trim().min(1).max(255).refine(isKnownProductId, "Unknown product id"),
        // Apple: base64 App Store receipt. Google: the purchase token.
        // Both come from the plugin's serverVerificationData, hence the wide ceiling.
        verificationData: z.string().trim().min(1).max(200_000),
    })
    .strict();

/**
 * POST /api/mobile/billing/verify
 * Validates a StoreKit / Play Billing purchase the device just completed and
 * activates the corresponding plan on the user's account. The client treats
 * this endpoint's success as the signal to `completePurchase()`.
 */
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        const userId = session.user.id;

        await enforceRateLimit(userId, "api");

        const { platform, productId, verificationData } = await validateBody(req, verifySchema);

        const result = await verifyAndApplyPurchase({ userId, platform, productId, verificationData });

        await logAudit({
            userId,
            action: "IAP_PURCHASE_VERIFIED",
            entity: "Subscription",
            entityId: userId,
            severity: result.isActive ? AuditLogSeverity.INFO : AuditLogSeverity.WARNING,
            details: { platform, productId, plan: result.plan, status: result.status },
        });

        return successResponse(result);
    } catch (error) {
        if (error instanceof IapNotConfiguredError) {
            return errorResponse(ApiErrors.serviceUnavailable("In-app purchases"));
        }
        if (error instanceof IapVerificationError) {
            return errorResponse(ApiErrors.badRequest(error.message));
        }
        return errorResponse(error);
    }
}
