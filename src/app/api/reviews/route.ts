import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateBody } from "@/lib/api-utils";

const createReviewSchema = z
    .object({
        documentationId: z.string().trim().min(1).max(100),
        reviewerId: z.string().trim().min(1).max(100).optional(),
        comments: z.string().trim().max(2000).optional(),
    })
    .strict();

// POST: Create a review request
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const { documentationId, reviewerId, comments } = await validateBody(req, createReviewSchema);

        const doc = await db.documentation.findUnique({
            where: { id: documentationId },
            include: { file: true },
        });

        if (!doc) {
            throw ApiErrors.notFound("Documentation");
        }

        const canRequest = await checkFilePermission(session.user.id, doc.fileId, "edit");
        if (!canRequest) {
            throw ApiErrors.forbidden();
        }

        if (reviewerId) {
            const canReviewerAccess = await checkFilePermission(reviewerId, doc.fileId, "view");
            if (!canReviewerAccess) {
                throw ApiErrors.badRequest("Selected reviewer cannot access this file");
            }
        }

        await db.documentation.update({
            where: { id: documentationId },
            data: { status: "REVIEW" },
        });

        const review = await db.reviewRequest.create({
            data: {
                documentationId,
                requesterId: session.user.id,
                reviewerId: reviewerId || null,
                comments,
                status: "PENDING",
            },
        });

        return NextResponse.json({ review });
    } catch (error) {
        return errorResponse(error);
    }
}

// GET: list review requests created by or assigned to current user
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const reviews = await db.reviewRequest.findMany({
            where: {
                OR: [{ requesterId: session.user.id }, { reviewerId: session.user.id }],
            },
            include: {
                documentation: {
                    select: {
                        file: { select: { id: true, name: true, teamId: true } },
                    },
                },
                requester: { select: { name: true, image: true } },
                reviewer: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ reviews });
    } catch (error) {
        return errorResponse(error);
    }
}
