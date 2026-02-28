import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";

/**
 * GET /api/admin/health
 * Comprehensive system health check for administrators.
 */
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        const adminCheck = await validateAdmin();
        if (!adminCheck.authorized) {
            return errorResponse(ApiErrors.forbidden("Admin access required"));
        }

        // Rate limit admin user
        await enforceRateLimit(session.user.id, "api");

        const checkFailures: string[] = [];

        // 1. Database Check
        let databaseHealthy = false;
        let userCount = 0;
        try {
            userCount = await db.user.count();
            databaseHealthy = true;
        } catch {
            checkFailures.push("database");
        }

        // 2. AI Check
        const aiConfigured = !!process.env.GOOGLE_API_KEY;

        // 3. Audit Integrity (Sample check of last 5)
        let auditChainValid = true;
        let tamperedCount = 0;
        try {
            const logs = await db.auditLog.findMany({
                orderBy: { createdAt: "desc" },
                take: 5,
            });

            for (const log of logs) {
                const timestamp = log.createdAt.toISOString();
                const detailsStr = log.details ? JSON.stringify(log.details) : "{}";
                const dataToHash = `${log.previousHash || ""}|${log.action}|${log.entityId}|${timestamp}|${detailsStr}`;
                const calculatedHash = createHash("sha256").update(dataToHash).digest("hex");

                if (calculatedHash !== log.hash) {
                    auditChainValid = false;
                    tamperedCount += 1;
                }
            }
        } catch {
            checkFailures.push("auditTrail");
        }

        // 4. Rate Limit Check (Redis)
        const redisConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

        return NextResponse.json({
            status: databaseHealthy && auditChainValid ? "healthy" : "degraded",
            timestamp: new Date().toISOString(),
            checkFailures,
            components: {
                database: {
                    status: databaseHealthy ? "online" : "offline",
                    stats: { totalUsers: userCount }
                },
                ai: {
                    status: aiConfigured ? "online" : "unconfigured",
                    provider: "gemini"
                },
                auditTrail: {
                    status: auditChainValid ? "intact" : "compromised",
                    tamperedCount
                },
                rateLimit: {
                    status: redisConfigured ? "active" : "disabled"
                }
            }
        });

    } catch (error) {
        return errorResponse(error);
    }
}
