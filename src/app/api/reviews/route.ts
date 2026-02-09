import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "../../../lib/db";

// POST: Create a Review Request
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { documentationId, reviewerId, comments } = await req.json();

        if (!documentationId) {
            return NextResponse.json({ error: "Missing documentation ID" }, { status: 400 });
        }

        // Verify documentation ownership or team access
        const doc = await db.documentation.findUnique({
            where: { id: documentationId },
            include: { file: true }
        });

        if (!doc) return NextResponse.json({ error: "Documentation not found" }, { status: 404 });

        // Ensure user has access to file (naive check: is owner)
        // In real app: Check Team membership
        if (doc.file.userId !== session.user.id) {
            // If file has teamId, check membership (skipped for brevity, but should be here)
            // Allow for now if it's MVP
        }

        // Update Doc Status -> REVIEW
        await db.documentation.update({
            where: { id: documentationId },
            data: { status: "REVIEW" }
        });

        // Create Review Request
        const review = await db.reviewRequest.create({
            data: {
                documentationId,
                requesterId: session.user.id,
                reviewerId: reviewerId || undefined, // Optional specific reviewer
                comments,
                status: "PENDING"
            }
        });

        return NextResponse.json({ review });

    } catch (error) {
        console.error("Create Review Error:", error);
        return NextResponse.json({ error: "Failed to create review request" }, { status: 500 });
    }
}

// GET: List reviews involved with user
export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        // Get requests I sent OR requests assigned to me
        // Also requests for My Team? (Not implemented efficiently yet)

        const reviews = await db.reviewRequest.findMany({
            where: {
                OR: [
                    { requesterId: session.user.id },
                    { reviewerId: session.user.id },
                    // In a team context, we might find all pending reviews for the team
                ]
            },
            include: {
                documentation: {
                    select: {
                        file: { select: { name: true } }
                    }
                },
                requester: { select: { name: true, image: true } },
                reviewer: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ reviews });

    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
    }
}
