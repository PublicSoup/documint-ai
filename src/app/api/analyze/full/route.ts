import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api-utils";
import { inngest } from "@/inngest/client";

const emptySchema = z.object({}).strict();

/**
 * POST /api/analyze/full
 * Triggers a comprehensive codebase-wide AI analysis background job.
 */
export const POST = createApiHandler({
    feature: "analytics",
    rateLimit: "upload",
    bodySchema: emptySchema,
    handler: async ({ userId }) => {
        // Dispatch the massive background job instead of blocking the function.
        const { ids } = await inngest.send({
            name: "codebase.analyze.full",
            data: { userId },
        });

        // Return success to the client INSTANTLY (UX Win).
        return NextResponse.json({
            status: "processing",
            jobId: ids[0],
            message: "Analyze Full Codebase workflow has been started natively in the background.",
            generatedAt: new Date().toISOString(),
        }, { status: 202 });
    },
});
