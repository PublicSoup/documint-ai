import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { createHash } from "crypto";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ApiErrors, errorResponse, validateQuery } from "@/lib/api-utils";

const verifyAuditQuerySchema = z
    .object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
    })
    .strict();

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            throw ApiErrors.unauthorized();
        }

        await enforceRateLimit(session.user.id, "api");

        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) {
            throw ApiErrors.forbidden("Admin access required");
        }

        const { limit } = validateQuery(request.nextUrl.searchParams, verifyAuditQuerySchema);

        const logs = await db.auditLog.findMany({
            orderBy: { createdAt: "asc" },
            take: limit,
        });

        if (logs.length === 0) {
            return NextResponse.json({ success: true, message: "No logs to verify" });
        }

        const verificationResults: Array<{
            id: string;
            action: string;
            timestamp: string;
            isHashValid: boolean;
            isLinkValid: boolean;
            entryValid: boolean;
        }> = [];

        let chainValid = true;

        for (let i = 0; i < logs.length; i += 1) {
            const log = logs[i];

            const timestamp = log.createdAt.toISOString();
            const dataToHash = `${log.previousHash}|${log.action}|${log.entityId}|${timestamp}|${JSON.stringify(log.details || {})}`;
            const calculatedHash = createHash("sha256").update(dataToHash).digest("hex");

            const isHashValid = calculatedHash === log.hash;

            let isLinkValid = true;
            if (i > 0) {
                isLinkValid = log.previousHash === logs[i - 1].hash;
            }

            const entryValid = isHashValid && isLinkValid;
            if (!entryValid) {
                chainValid = false;
            }

            verificationResults.push({
                id: log.id,
                action: log.action,
                timestamp,
                isHashValid,
                isLinkValid,
                entryValid,
            });
        }

        return NextResponse.json({
            success: chainValid,
            totalVerified: logs.length,
            results: verificationResults,
            summary: {
                tamperedCount: verificationResults.filter((result) => !result.entryValid).length,
                chainIntegrity: chainValid ? "INTACT" : "COMPROMISED",
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}
