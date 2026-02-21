import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";

const updateReviewSchema = z.object({
    status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
    comments: z.string().max(4000).optional(),
}).strict();

// PUT: Update review status
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;

    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = updateReviewSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { status, comments } = parsed.data;

        const review = await db.reviewRequest.findUnique({
            where: { id: params.id },
            include: {
                documentation: {
                    select: { id: true, fileId: true },
                },
            },
        });

        if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

        const canApprove = await checkFilePermission(session.user.id, review.documentation.fileId, "approve");
        const isAssignedReviewer = review.reviewerId === session.user.id;

        if (!canApprove && !isAssignedReviewer) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (status === "APPROVED" && review.requesterId === session.user.id && !canApprove) {
            return NextResponse.json({ error: "Requester cannot self-approve" }, { status: 403 });
        }

        const mergedComments = comments
            ? `${review.comments || ""}${review.comments ? "\n---\n" : ""}[${status}] ${comments}`
            : review.comments;

        await db.reviewRequest.update({
            where: { id: params.id },
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
        console.error("Update Review Error:", error);
        return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
    }
}
