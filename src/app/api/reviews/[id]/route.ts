import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const reviewIdParamsSchema = z
    .object({
        id: z.string().trim().min(1).max(100),
    })
    .strict();

const updateReviewSchema = z
    .object({
        status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
        comments: z.string().trim().max(4000).optional(),
    })
    .strict();

// PUT: Update review status
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const parsedParams = reviewIdParamsSchema.safeParse(await props.params);
        if (!parsedParams.success) {
            throw ApiErrors.badRequest("Invalid review id", parsedParams.error.flatten());
        }
        const reviewId = parsedParams.data.id;

        const { status, comments } = await validateBody(req, updateReviewSchema);

        const review = await db.reviewRequest.findUnique({
            where: { id: reviewId },
            include: {
                documentation: {
                    select: { id: true, fileId: true },
                },
            },
        });

        if (!review) {
            throw ApiErrors.notFound("Review");
        }

        const canApprove = await checkFilePermission(session.user.id, review.documentation.fileId, "approve");
        const isAssignedReviewer = review.reviewerId === session.user.id;

        if (!canApprove && !isAssignedReviewer) {
            throw ApiErrors.forbidden();
        }

        if (status === "APPROVED" && review.requesterId === session.user.id && !canApprove) {
            throw ApiErrors.forbidden("Requester cannot self-approve");
        }

        const mergedComments = comments
            ? `${review.comments || ""}${review.comments ? "\n---\n" : ""}[${status}] ${comments}`
            : review.comments;

        await db.reviewRequest.update({
            where: { id: reviewId },
            data: {
                status,
                comments: mergedComments,
                reviewerId: review.reviewerId || session.user.id,
            },
        });

        if (status === "APPROVED") {
            await db.documentation.update({
                where: { id: review.documentationId },
                data: { status: "APPROVED", verifiedAt: new Date(), verifiedById: session.user.id },
            });
        } else {
            await db.documentation.update({
                where: { id: review.documentationId },
                data: { status: "DRAFT", verifiedAt: null, verifiedById: null },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse(error);
    }
}
