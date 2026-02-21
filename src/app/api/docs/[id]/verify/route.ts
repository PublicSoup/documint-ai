import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkFilePermission } from "@/lib/permissions";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Enforce rate limit
        await enforceRateLimit(session.user.id, "api");

        const { id } = await params;

        const canApprove = await checkFilePermission(session.user.id, id, "approve");
        if (!canApprove) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

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

        // Use dynamic import for logAudit to avoid potential circular dependencies
        // and because this is a server-side route
        const { logAudit } = await import("@/lib/audit-logger");
        await logAudit({
            action: isVerified ? "UNVERIFY" : "VERIFY",
            entity: "Documentation",
            entityId: doc.id,
            userId: session.user.id,
            details: {
                fileId: doc.fileId,
                fileName: doc.file.name,
                previousStatus: doc.status,
                newStatus: updatedDoc.status
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
