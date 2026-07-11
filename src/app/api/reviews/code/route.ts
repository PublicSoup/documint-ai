import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    repo: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]).optional(),
}).strict();

/** GET /api/reviews/code → paginated AI code-review history for you & your teams. */
export async function GET(req: NextRequest) {
    try {
        const gate = await requireFeature("autoCodeReview");
        if (gate) return gate;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        await enforceRateLimit(session.user.id, "api");

        const { page, limit, repo, status } = validateQuery(req.nextUrl.searchParams, querySchema);

        const teamIds = (
            await db.teamMember.findMany({ where: { userId: session.user.id }, select: { teamId: true } })
        ).map((m: { teamId: string }) => m.teamId);

        const where: Prisma.CodeReviewWhereInput = {
            OR: [{ userId: session.user.id }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
            ...(repo ? { repoFullName: repo } : {}),
            ...(status ? { status } : {}),
        };

        const [reviews, total] = await db.$transaction([
            db.codeReview.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            db.codeReview.count({ where }),
        ]);

        return NextResponse.json({
            reviews,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return errorResponse(error);
    }
}
