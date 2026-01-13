import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Verify ownership or team permissions (simplified for now to verification)
        const doc = await db.documentation.findUnique({
            where: { fileId: id },
            include: { file: true }
        });

        if (!doc) {
            return NextResponse.json({ error: "Documentation not found" }, { status: 404 });
        }

        // Toggle verification
        const isVerified = !!doc.verifiedAt;

        // If already verified, unverify. If not, verify.
        const updatedDoc = await db.documentation.update({
            where: { fileId: id },
            data: {
                verifiedAt: isVerified ? null : new Date(),
                verifiedById: isVerified ? null : session.user.id,
                // Optionally update status too
                status: isVerified ? "DRAFT" : "APPROVED"
            }
        });

        return NextResponse.json({
            success: true,
            verified: !isVerified,
            verifiedAt: updatedDoc.verifiedAt,
            verifiedById: updatedDoc.verifiedById
        });

    } catch (error) {
        console.error("Verification error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
