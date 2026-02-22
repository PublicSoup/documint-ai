import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeFullCodebase } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

/**
 * POST /api/analyze/full
 * Performs a comprehensive codebase-wide AI analysis. Premium feature.
 */
export async function POST(_req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Feature Gate: This is a premium/analytics feature
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        // 2. Enforce Rate Limit (Lower tier limit for heavy AI tasks)
        await enforceRateLimit(session.user.id, "upload");

        // 3. Perform full codebase analysis
        const analysis = await analyzeFullCodebase(session.user.id);

        // 4. Audit Log
        try {
            const { logAudit } = await import("@/lib/audit-logger");
            await logAudit({
                userId: session.user.id,
                action: "ANALYZE_FULL_CODEBASE",
                entity: "User",
                entityId: session.user.id,
            });
        } catch {
            // Non-blocking
        }

        return NextResponse.json({
            analysis,
            generatedAt: new Date().toISOString()
        });

    } catch (error) {
        return errorResponse(error);
    }
}
