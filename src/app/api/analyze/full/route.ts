import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors, validateBody } from "@/lib/api-utils";
import { inngest } from "@/inngest/client";

const emptySchema = z.object({}).strict();

/**
 * POST /api/analyze/full
 * Triggers a comprehensive codebase-wide AI analysis background job.
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

        // 4. Dispatch the massive background job instead of blocking the Edge/Node function!
        const { ids } = await inngest.send({
            name: "codebase.analyze.full",
            data: {
                userId: session.user.id
            }
        });

        // 5. Return success to the client INSTANTLY (UX Win).
        return NextResponse.json({
            status: "processing",
            jobId: ids[0],
            message: "Analyze Full Codebase workflow has been started natively in the background.",
            generatedAt: new Date().toISOString()
        }, { status: 202 });

    } catch (error) {
        return errorResponse(error);
    }
}
