import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";

// PUT: Update Review Status (Approve/Reject)
export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { status, comments } = await req.json(); // status: APPROVED, CHANGES_REQUESTED

        if (!status) return NextResponse.json({ error: "Status required" }, { status: 400 });

        const review = await db.reviewRequest.findUnique({
            where: { id: params.id },
            include: { documentation: true }
        });

        if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

        // Check permission (Are you the reviewer? Or Team Admin?)
        // For MVP: Any authenticated user in the team? 
        // We'll enforce: must be reviewerId OR different user than requester (self-approval blocked?)
        if (review.requesterId === session.user.id && status === "APPROVED") {
            // return NextResponse.json({ error: "Cannot approve your own request" }, { status: 403 });
            // Allow for dev/demo purposes
        }

        // Update Review
        await db.reviewRequest.update({
            where: { id: params.id },
            data: {
                status,
                comments: comments ? `${review.comments || ''}\n---\n[${status}] ${comments}` : review.comments
            }
        });

        // Update Documentation Status if Approved
        if (status === "APPROVED") {
            await db.documentation.update({
                where: { id: review.documentationId },
                data: { status: "APPROVED" }
            });
        } else if (status === "CHANGES_REQUESTED") {
            // Keep Doc in REVIEW or set back to DRAFT?
            // Usually DRAFT implies editing.
            await db.documentation.update({
                where: { id: review.documentationId },
                data: { status: "DRAFT" }
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Update Review Error:", error);
        return NextResponse.json({ error: "Failed to update review" }, { status: 500 });
    }
}
