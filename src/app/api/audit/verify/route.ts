import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { validateAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

        // Fetch logs in ascending order to verify the chain forward
        const logs = await db.auditLog.findMany({
            orderBy: { createdAt: "asc" },
            take: limit,
        });

        if (logs.length === 0) {
            return NextResponse.json({ success: true, message: "No logs to verify" });
        }

        const verificationResults = [];
        let chainValid = true;

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            
            // 1. Recalculate hash
            // Format must match src/lib/audit-logger.ts exactly
            const timestamp = log.createdAt.toISOString();
            const dataToHash = `${log.previousHash}|${log.action}|${log.entityId}|${timestamp}|${JSON.stringify(log.details || {})}`;
            const calculatedHash = createHash("sha256").update(dataToHash).digest("hex");

            const isHashValid = calculatedHash === log.hash;
            
            // 2. Check chain link (previousHash should match the hash of the entry before it)
            // Note: For the first entry in our fetched set, we can only verify its own hash, 
            // unless we fetch the one before it too.
            let isLinkValid = true;
            if (i > 0) {
                isLinkValid = log.previousHash === logs[i-1].hash;
            }

            const entryValid = isHashValid && isLinkValid;
            if (!entryValid) chainValid = false;

            verificationResults.push({
                id: log.id,
                action: log.action,
                timestamp,
                isHashValid,
                isLinkValid,
                entryValid
            });
        }

        return NextResponse.json({
            success: chainValid,
            totalVerified: logs.length,
            results: verificationResults,
            summary: {
                tamperedCount: verificationResults.filter(r => !r.entryValid).length,
                chainIntegrity: chainValid ? "INTACT" : "COMPROMISED"
            }
        });

    } catch (error) {
        console.error("[AuditVerify_API] Error:", error);
        return NextResponse.json({ error: "Verification Failed" }, { status: 500 });
    }
}
