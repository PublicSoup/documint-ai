import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { analyzeFullCodebase } from "@/lib/ai";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors, validateBody } from "@/lib/api-utils";

const emptySchema = z.object({}).strict();

/**
 * POST /api/analyze/full
 * Performs a comprehensive codebase-wide AI analysis. Premium feature.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        // 1. Validate empty body to ensure no unexpected payload
        await validateBody(req, emptySchema);

        // 2. Feature Gate: This is a premium/analytics feature
        const gateError = await requireFeature("analytics");
        if (gateError) return gateError;

        // 3. Enforce Rate Limit (Lower tier limit for heavy AI tasks)
        await enforceRateLimit(session.user.id, "upload");

        // 4. Perform full codebase analysis
        const analysis = await analyzeFullCodebase(session.user.id);

        // 5. Audit Log
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
