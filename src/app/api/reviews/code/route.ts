import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createApiHandler } from "@/lib/api-utils";

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    repo: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]).optional(),
}).strict();

/** GET /api/reviews/code → paginated AI code-review history for you & your teams. */
export const GET = createApiHandler({
    feature: "autoCodeReview",
    rateLimit: "api",
    querySchema,
    handler: async ({ query, userId }) => {
        const { page, limit, repo, status } = query;

        const teamIds = (
            await db.teamMember.findMany({ where: { userId }, select: { teamId: true } })
        ).map((m: { teamId: string }) => m.teamId);

        const where: Prisma.CodeReviewWhereInput = {
            OR: [{ userId }, ...(teamIds.length ? [{ teamId: { in: teamIds } }] : [])],
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

        return {
            reviews,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    },
});
