import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkFilePermission } from "@/lib/permissions";

const createReviewSchema = z.object({
    documentationId: z.string().min(1),
    reviewerId: z.string().optional(),
    comments: z.string().max(2000).optional(),
}).strict();

// POST: Create a review request
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = createReviewSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const { documentationId, reviewerId, comments } = parsed.data;

        const doc = await db.documentation.findUnique({
            where: { id: documentationId },
            include: { file: true },
        });

        if (!doc) return NextResponse.json({ error: "Documentation not found" }, { status: 404 });

        const canRequest = await checkFilePermission(session.user.id, doc.fileId, "edit");
        if (!canRequest) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (reviewerId) {
            const canReviewerAccess = await checkFilePermission(reviewerId, doc.fileId, "view");
            if (!canReviewerAccess) {
                return NextResponse.json({ error: "Selected reviewer cannot access this file" }, { status: 400 });
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
        console.error("Create Review Error:", error);
        return NextResponse.json({ error: "Failed to create review request" }, { status: 500 });
    }
}

// GET: list review requests created by or assigned to current user
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const reviews = await db.reviewRequest.findMany({
            where: {
                OR: [
                    { requesterId: session.user.id },
                    { reviewerId: session.user.id },
                ],
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
        console.error("Fetch Review Error:", error);
        return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
    }
}
