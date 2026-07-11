import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFeature } from "@/lib/feature-gate";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody, validateQuery } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit-logger";
import { normalizePolicy } from "@/lib/code-review";

const severity = z.enum(["info", "low", "medium", "high", "critical"]);

const upsertSchema = z.object({
    repoFullName: z.string().trim().regex(/^[^/\s]+\/[^/\s]+$/, "Expected owner/repo"),
    teamId: z.string().trim().min(1).max(100).nullish(),
    enabled: z.boolean().optional(),
    autoReview: z.boolean().optional(),
    postComments: z.boolean().optional(),
    postStatus: z.boolean().optional(),
    blockingSeverity: severity.optional(),
    checks: z.object({
        security: z.boolean(),
        performance: z.boolean(),
        style: z.boolean(),
        breaking: z.boolean(),
        tests: z.boolean(),
        docs: z.boolean(),
    }).partial().optional(),
    ignorePaths: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    instructions: z.string().trim().max(4000).nullish(),
}).strict();

const querySchema = z.object({
    repo: z.string().trim().min(1).max(200).optional(),
}).strict();

/** GET /api/reviews/policy               → list your repo policies
 *  GET /api/reviews/policy?repo=owner/rp → single policy (or defaults) */
export async function GET(req: NextRequest) {
    try {
        const gate = await requireFeature("autoCodeReview");
        if (gate) return gate;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        await enforceRateLimit(session.user.id, "api");

        const { repo } = validateQuery(req.nextUrl.searchParams, querySchema);

        if (repo) {
            const policy = await db.reviewPolicy.findUnique({ where: { repoFullName: repo } });
            if (policy && policy.ownerUserId !== session.user.id) throw ApiErrors.forbidden();
            return NextResponse.json({ policy, config: normalizePolicy(policy ?? undefined), exists: Boolean(policy) });
        }

        const policies = await db.reviewPolicy.findMany({
            where: { ownerUserId: session.user.id },
            orderBy: { updatedAt: "desc" },
        });
        return NextResponse.json({ policies });
    } catch (error) {
        return errorResponse(error);
    }
}

/** PUT /api/reviews/policy → create or update the policy for a repo. */
export async function PUT(req: NextRequest) {
    try {
        const gate = await requireFeature("autoCodeReview");
        if (gate) return gate;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        await enforceRateLimit(session.user.id, "api");

        const body = await validateBody(req, upsertSchema);

        // A GitHub connection is required — its token is what fetches diffs & posts reviews.
        const connection = await db.gitHubConnection.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
        });
        if (!connection) throw ApiErrors.badRequest("Connect your GitHub account before enabling reviews");

        // Ownership guard: cannot hijack another owner's policy for the same repo.
        const existing = await db.reviewPolicy.findUnique({ where: { repoFullName: body.repoFullName } });
        if (existing && existing.ownerUserId !== session.user.id) throw ApiErrors.forbidden("Repo already configured by another user");

        const data = {
            teamId: body.teamId ?? null,
            enabled: body.enabled,
            autoReview: body.autoReview,
            postComments: body.postComments,
            postStatus: body.postStatus,
            blockingSeverity: body.blockingSeverity,
            checks: body.checks ?? undefined,
            ignorePaths: body.ignorePaths ?? undefined,
            instructions: body.instructions ?? null,
        };

        const policy = await db.reviewPolicy.upsert({
            where: { repoFullName: body.repoFullName },
            create: {
                repoFullName: body.repoFullName,
                ownerUserId: session.user.id,
                ...data,
            },
            update: data,
        });

        await logAudit({
            userId: session.user.id,
            action: existing ? "UPDATE_REVIEW_POLICY" : "CREATE_REVIEW_POLICY",
            entity: "ReviewPolicy",
            entityId: policy.id,
            details: { repoFullName: body.repoFullName, enabled: policy.enabled },
        });

        return NextResponse.json({ policy, config: normalizePolicy(policy) });
    } catch (error) {
        return errorResponse(error);
    }
}

/** DELETE /api/reviews/policy?repo=owner/rp → disable auto-review for a repo. */
export async function DELETE(req: NextRequest) {
    try {
        const gate = await requireFeature("autoCodeReview");
        if (gate) return gate;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) throw ApiErrors.unauthorized();
        await enforceRateLimit(session.user.id, "api");

        const { repo } = validateQuery(req.nextUrl.searchParams, querySchema);
        if (!repo) throw ApiErrors.badRequest("Missing repo");

        const policy = await db.reviewPolicy.findUnique({ where: { repoFullName: repo } });
        if (!policy) throw ApiErrors.notFound("Review policy");
        if (policy.ownerUserId !== session.user.id) throw ApiErrors.forbidden();

        await db.reviewPolicy.delete({ where: { id: policy.id } });
        await logAudit({
            userId: session.user.id,
            action: "DELETE_REVIEW_POLICY",
            entity: "ReviewPolicy",
            entityId: policy.id,
            details: { repoFullName: repo },
        });

        return NextResponse.json({ deleted: true });
    } catch (error) {
        return errorResponse(error);
    }
}
