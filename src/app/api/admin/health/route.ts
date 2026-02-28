import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { WebContainerManager } from "@/lib/web-container";

/**
 * GET /api/admin/health
 * Comprehensive system health check for administrators.
 */
export async function GET() {
    const startedAt = Date.now();

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

        // 5. WebContainer Runtime Health Snapshot
        const WEB_CONTAINER_RECOVERY_DEGRADED_THRESHOLD = 5;
        const WEB_CONTAINER_TRACKED_PROCESS_DEGRADED_THRESHOLD = 25;
        let webContainerHealth: ReturnType<typeof WebContainerManager.getHealthSnapshot> | null = null;
        let webContainerDegraded = false;

        try {
            webContainerHealth = WebContainerManager.getHealthSnapshot();
            const recoveryRateDegraded = webContainerHealth.recoveryCount >= WEB_CONTAINER_RECOVERY_DEGRADED_THRESHOLD;
            const trackedProcessDegraded = webContainerHealth.trackedProcessCount >= WEB_CONTAINER_TRACKED_PROCESS_DEGRADED_THRESHOLD;

            webContainerDegraded = recoveryRateDegraded || trackedProcessDegraded;

            if (recoveryRateDegraded) {
                checkFailures.push("webContainerRecoveryRate");
            }

            if (trackedProcessDegraded) {
                checkFailures.push("webContainerTrackedProcessPressure");
            }
        } catch {
            checkFailures.push("webContainer");
        }

        const degradedComponents = [
            !databaseHealthy ? "database" : null,
            !auditChainValid ? "auditTrail" : null,
            webContainerDegraded ? "webContainer" : null,
            !redisConfigured ? "rateLimit" : null,
        ].filter((value): value is string => Boolean(value)).sort();

        const severity: "healthy" | "degraded" | "critical" =
            !databaseHealthy || !auditChainValid
                ? "critical"
                : degradedComponents.length > 0
                    ? "degraded"
                    : "healthy";

        const uniqueFailures = [...new Set(checkFailures)];

        const recommendedActions = [
            uniqueFailures.includes("database") ? "Verify database connectivity and Prisma migrations, then rerun admin health checks." : null,
            uniqueFailures.includes("auditTrail") ? "Run audit chain verification and inspect recent mutation logs for tampering or hash drift." : null,
            uniqueFailures.includes("webContainerRecoveryRate") ? "Restart IDE runtime sessions and inspect WebContainer recovery churn for repeated boot failures." : null,
            uniqueFailures.includes("webContainerTrackedProcessPressure") ? "Stop stale WebContainer processes and investigate process leak sources in terminal/runner workflows." : null,
            uniqueFailures.includes("rateLimit") ? "Confirm Upstash Redis credentials and network reachability; fallback mode should only be temporary." : null,
        ].filter((value): value is string => Boolean(value));

        const runbooks: Record<string, string> = {
            database: "/docs/ops/runbooks/database-connectivity",
            auditTrail: "/docs/ops/runbooks/audit-integrity",
            webContainer: "/docs/ops/runbooks/webcontainer-runtime",
            rateLimit: "/docs/ops/runbooks/rate-limit-backend",
        };

        const runbookUrls = degradedComponents.map((component) => runbooks[component]).filter((value): value is string => Boolean(value));

        const healthVersion = "2026-02-27.v1";
        const schemaCapabilities = {
            degradedComponents: true,
            componentSeverity: true,
            recommendedActions: true,
            runbookUrls: true,
            webContainerSnapshot: true,
            webContainerThresholdSignals: true,
        } as const;

        return NextResponse.json(
            {
                healthVersion,
                schemaCapabilities,
                status: severity === "healthy" ? "healthy" : "degraded",
                severity,
                timestamp: new Date().toISOString(),
                checkDurationMs: Date.now() - startedAt,
                checkFailures: uniqueFailures,
                degradedComponents,
                recommendedActions,
                runbookUrls: [...new Set(runbookUrls)],
                components: {
                    database: {
                        status: databaseHealthy ? "online" : "offline",
                        severity: databaseHealthy ? "healthy" : "critical",
                        stats: { totalUsers: userCount }
                    },
                    ai: {
                        status: aiConfigured ? "online" : "unconfigured",
                        severity: aiConfigured ? "healthy" : "degraded",
                        provider: "gemini"
                    },
                    auditTrail: {
                        status: auditChainValid ? "intact" : "compromised",
                        severity: auditChainValid ? "healthy" : "critical",
                        tamperedCount
                    },
                    rateLimit: {
                        status: redisConfigured ? "active" : "disabled",
                        severity: redisConfigured ? "healthy" : "degraded",
                    },
                    webContainer: webContainerHealth
                        ? {
                              status: webContainerDegraded ? "degraded" : "online",
                              severity: webContainerDegraded ? "degraded" : "healthy",
                              recoveryDegradedThreshold: WEB_CONTAINER_RECOVERY_DEGRADED_THRESHOLD,
                              trackedProcessDegradedThreshold: WEB_CONTAINER_TRACKED_PROCESS_DEGRADED_THRESHOLD,
                              ...webContainerHealth,
                          }
                        : {
                              status: "unavailable",
                              severity: "degraded",
                          },
                }
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );

    } catch (error) {
        return errorResponse(error);
    }
}
