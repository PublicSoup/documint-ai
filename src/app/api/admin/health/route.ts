import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { validateAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/health
 * Comprehensive system health check for administrators.
 */
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

        // 1. Database Check
        let databaseHealthy = false;
        let userCount = 0;
        try {
            userCount = await db.user.count();
            databaseHealthy = true;
        } catch (e) {
            console.error("Health Check: DB Failed", e);
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

            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                const timestamp = log.createdAt.toISOString();
                // Matching logAudit format in src/lib/audit-logger.ts
                const dataToHash = `${log.previousHash}|${log.action}|${log.entityId}|${timestamp}|${JSON.stringify(log.details || {})}`;
                const calculatedHash = createHash("sha256").update(dataToHash).digest("hex");
                
                if (calculatedHash !== log.hash) {
                    auditChainValid = false;
                    tamperedCount++;
                }
            }
        } catch (e) {
            console.error("Health Check: Audit Check Failed", e);
        }

        // 4. Rate Limit Check (Redis)
        const redisConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

        return NextResponse.json({
            status: databaseHealthy ? "healthy" : "degraded",
            timestamp: new Date().toISOString(),
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
        console.error("[AdminHealth_API] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
