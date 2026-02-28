import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { validateAdmin } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { WebContainerManager } from "@/lib/web-container";

const ADMIN_HEALTH_RESPONSE_SCHEMA_HASH = "admin-health-2026-02-27-v1";

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

        const componentLastCheckedAt = {
            database: null as string | null,
            ai: null as string | null,
            auditTrail: null as string | null,
            rateLimit: null as string | null,
            webContainer: null as string | null,
        };

        // 1. Database Check
        let databaseHealthy = false;
        let userCount = 0;
        try {
            userCount = await db.user.count();
            databaseHealthy = true;
        } catch {
            checkFailures.push("database");
        } finally {
            componentLastCheckedAt.database = new Date().toISOString();
        }

        // 2. AI Check
        const aiConfigured = !!process.env.GOOGLE_API_KEY;
        componentLastCheckedAt.ai = new Date().toISOString();

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
        } finally {
            componentLastCheckedAt.auditTrail = new Date().toISOString();
        }

        // 4. Rate Limit Check (Redis)
        const redisConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
        componentLastCheckedAt.rateLimit = new Date().toISOString();

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
        } finally {
            componentLastCheckedAt.webContainer = new Date().toISOString();
        }

        const degradedComponents = [
            !databaseHealthy ? "database" : null,
            !auditChainValid ? "auditTrail" : null,
            webContainerDegraded ? "webContainer" : null,
            !redisConfigured ? "rateLimit" : null,
        ].filter((value): value is string => Boolean(value)).sort();

        const degradedComponentCount = degradedComponents.length;
        const criticalComponents = [
            !databaseHealthy ? "database" : null,
            !auditChainValid ? "auditTrail" : null,
        ].filter((value): value is string => Boolean(value));
        const criticalComponentCount = criticalComponents.length;

        const severity: "healthy" | "degraded" | "critical" =
            !databaseHealthy || !auditChainValid
                ? "critical"
                : degradedComponentCount > 0
                    ? "degraded"
                    : "healthy";

        const incidentClass =
            !databaseHealthy ? "availability" :
            !auditChainValid ? "integrity" :
            degradedComponents.includes("webContainer") ? "runtime" :
            degradedComponents.includes("rateLimit") ? "throttling" :
            degradedComponents.length > 0 ? "operations" :
            "none";

        const healthSummaryCode =
            !databaseHealthy ? "CRITICAL_DB" :
            !auditChainValid ? "CRITICAL_AUDIT" :
            degradedComponents.includes("webContainer") ? "DEGRADED_WEB" :
            degradedComponents.includes("rateLimit") ? "DEGRADED_RATELIMIT" :
            degradedComponentCount > 0 ? "DEGRADED_OTHER" :
            "OK";

        const alertSuppressionHint =
            process.env.NODE_ENV !== "production" && healthSummaryCode === "DEGRADED_RATELIMIT"
                ? "suppress-nonprod-ratelimit"
                : "none";

        const incidentRoutingHint =
            incidentClass === "availability" ? "platform-database-oncall" :
            incidentClass === "integrity" ? "security-integrity-oncall" :
            incidentClass === "runtime" ? "ide-runtime-oncall" :
            incidentClass === "throttling" ? "platform-infra-oncall" :
            incidentClass === "operations" ? "platform-operations" :
            "none";

        const summaryCodePriority =
            healthSummaryCode === "CRITICAL_DB" ? 100 :
            healthSummaryCode === "CRITICAL_AUDIT" ? 95 :
            healthSummaryCode === "DEGRADED_WEB" ? 70 :
            healthSummaryCode === "DEGRADED_RATELIMIT" ? 60 :
            healthSummaryCode === "DEGRADED_OTHER" ? 50 :
            0;

        const opsEscalationRequired = severity === "critical" || criticalComponentCount > 0 || summaryCodePriority >= 90;
        const opsEscalationReason =
            severity === "critical" ? "critical-severity" :
            criticalComponentCount > 0 ? "critical-component" :
            summaryCodePriority >= 90 ? "priority-threshold" :
            "none";

        const uniqueFailures = [...new Set(checkFailures)];

        const recommendedActions = [
            uniqueFailures.includes("database") ? "Verify database connectivity and Prisma migrations, then rerun admin health checks." : null,
            uniqueFailures.includes("auditTrail") ? "Run audit chain verification and inspect recent mutation logs for tampering or hash drift." : null,
            uniqueFailures.includes("webContainerRecoveryRate") ? "Restart IDE runtime sessions and inspect WebContainer recovery churn for repeated boot failures." : null,
            uniqueFailures.includes("webContainerTrackedProcessPressure") ? "Stop stale WebContainer processes and investigate process leak sources in terminal/runner workflows." : null,
            uniqueFailures.includes("rateLimit") ? "Confirm Upstash Redis credentials and network reachability; fallback mode should only be temporary." : null,
        ].filter((value): value is string => Boolean(value)).sort();

        const runbooks: Record<string, string> = {
            database: "/docs/ops/runbooks/database-connectivity",
            auditTrail: "/docs/ops/runbooks/audit-integrity",
            webContainer: "/docs/ops/runbooks/webcontainer-runtime",
            rateLimit: "/docs/ops/runbooks/rate-limit-backend",
        };

        const runbookUrls = degradedComponents.map((component) => runbooks[component]).filter((value): value is string => Boolean(value));

        const healthVersion = "2026-02-27.v1";
        const generatedAtEpochMs = Date.now();
        const generatedAtIso = new Date(generatedAtEpochMs).toISOString();

        const responseLatencyBucket =
            generatedAtEpochMs - startedAt >= 500 ? "slow" :
            generatedAtEpochMs - startedAt >= 200 ? "elevated" :
            "normal";

        const diagnosticDataFreshnessSec = Math.max(0, Math.floor((Date.now() - generatedAtEpochMs) / 1000));

        const dataSourceStatuses = {
            database: databaseHealthy ? "online" : "offline",
            auditTrail: auditChainValid ? "intact" : "compromised",
            webContainer: webContainerHealth ? (webContainerDegraded ? "degraded" : "online") : "unavailable",
            rateLimit: redisConfigured ? "active" : "disabled",
            ai: aiConfigured ? "online" : "unconfigured",
        } as const;

        const COMPONENT_STALE_THRESHOLD_MS = 5_000;

        const staleComponentCount = Object.values(componentLastCheckedAt).reduce((count, timestamp) => {
            if (!timestamp) {
                return count + 1;
            }

            const checkedAtMs = Date.parse(timestamp);
            if (Number.isNaN(checkedAtMs)) {
                return count + 1;
            }

            return generatedAtEpochMs - checkedAtMs > COMPONENT_STALE_THRESHOLD_MS ? count + 1 : count;
        }, 0);

        const opsReadinessScore = Math.max(
            0,
            100 -
                (severity === "critical" ? 60 : severity === "degraded" ? 25 : 0) -
                staleComponentCount * 5 -
                (responseLatencyBucket === "slow" ? 15 : responseLatencyBucket === "elevated" ? 5 : 0),
        );

        const opsReadinessBand =
            opsReadinessScore >= 90 ? "excellent" :
            opsReadinessScore >= 70 ? "good" :
            opsReadinessScore >= 40 ? "risk" :
            "critical";

        const schemaCapabilities = {
            degradedComponents: true,
            componentSeverity: true,
            recommendedActions: true,
            runbookUrls: true,
            webContainerSnapshot: true,
            webContainerThresholdSignals: true,
            responseTimingEpochMs: true,
            responseGeneratedBy: true,
            responseLatencyBucket: true,
            diagnosticDataFreshnessSec: true,
            dataSourceStatuses: true,
            componentLastCheckedAt: true,
            staleComponentCount: true,
            degradedComponentCount: true,
            degradedComponentNamesCsv: true,
            criticalComponentCount: true,
            criticalComponentNamesCsv: true,
            opsEscalationRequired: true,
            opsEscalationReason: true,
            incidentClass: true,
            incidentRoutingHint: true,
            alertSuppressionHint: true,
            opsReadinessScore: true,
            opsReadinessBand: true,
        } as const;

        const responseGeneratedBy = {
            service: "documint-web",
            endpoint: "/api/admin/health",
            environment: process.env.NODE_ENV ?? "unknown",
            runtime: "nextjs-route-handler",
        } as const;

        return NextResponse.json(
            {
                healthVersion,
                responseSchemaHash: ADMIN_HEALTH_RESPONSE_SCHEMA_HASH,
                schemaCapabilities,
                responseGeneratedBy,
                status: severity === "healthy" ? "healthy" : "degraded",
                severity,
                incidentClass,
                incidentRoutingHint,
                alertSuppressionHint,
                opsReadinessScore,
                opsReadinessBand,
                healthSummaryCode,
                summaryCodePriority,
                opsEscalationRequired,
                opsEscalationReason,
                timestamp: generatedAtIso,
                checkStartedAtEpochMs: startedAt,
                generatedAtEpochMs,
                checkDurationMs: generatedAtEpochMs - startedAt,
                responseLatencyBucket,
                diagnosticDataFreshnessSec,
                checkFailures: uniqueFailures,
                degradedComponents,
                degradedComponentCount,
                degradedComponentNamesCsv: degradedComponents.join(","),
                criticalComponentCount,
                criticalComponentNamesCsv: criticalComponents.join(","),
                recommendedActions,
                runbookUrls: [...new Set(runbookUrls)],
                dataSourceStatuses,
                componentLastCheckedAt,
                staleComponentCount,
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
