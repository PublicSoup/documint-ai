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
const ADMIN_HEALTH_CONTRACT_REVISION = 1;
const ADMIN_HEALTH_RESPONSE_SHAPE_ID = "ah.v1.core";
const ADMIN_HEALTH_CONTRACT_COMPATIBILITY_MODE = "strict";
const ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_VERSION = "2026-02-27.v1";
const ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_MODE = "score-threshold-v1";
const ADMIN_HEALTH_POLICY_MISMATCH_ALERT_POLICY_VERSION = "2026-02-27.v1";
const ADMIN_HEALTH_POLICY_MISMATCH_ALERT_POLICY_MODE = "score-threshold-v1";

let previousHealthSignalDigest: string | null = null;
let previousHealthSignalObservedAt: string | null = null;
let currentHealthSignalStableSince: string | null = null;
let healthSignalTransitionCount = 0;
let previousHealthSignalVolatilityScore: number | null = null;
let previousPolicyMismatchDigest: string | null = null;
let currentPolicyMismatchStableSince: string | null = null;
let policyMismatchTransitionCount = 0;

const HEALTH_SIGNAL_FLAPPING_TRANSITION_THRESHOLD = 3;
const HEALTH_SIGNAL_FLAPPING_STABILITY_WINDOW_SEC = 300;
const HEALTH_SIGNAL_TRANSITION_COUNT_MAX = 10_000;

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

        const escalationSignals = {
            criticalSeverity: severity === "critical",
            criticalComponent: criticalComponentCount > 0,
            priorityThreshold: summaryCodePriority >= 90,
        } as const;

        const escalationSignalNames = Object.entries(escalationSignals)
            .filter(([, isActive]) => isActive)
            .map(([name]) => name)
            .sort();

        const escalationSignalCount = escalationSignalNames.length;

        const opsEscalationRequired = escalationSignalCount > 0;
        const opsEscalationReason =
            escalationSignals.criticalSeverity ? "critical-severity" :
            escalationSignals.criticalComponent ? "critical-component" :
            escalationSignals.priorityThreshold ? "priority-threshold" :
            "none";

        const opsEscalationFingerprint = opsEscalationRequired
            ? createHash("sha256")
                  .update([
                      healthSummaryCode,
                      incidentClass,
                      degradedComponents.join(","),
                      criticalComponents.join(","),
                      opsEscalationReason,
                  ].join("|"))
                  .digest("hex")
                  .slice(0, 16)
            : "none";

        const uniqueFailures = [...new Set(checkFailures)].sort();

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

        const checkDurationMs = generatedAtEpochMs - startedAt;

        const responseLatencyBucket =
            checkDurationMs >= 500 ? "slow" :
            checkDurationMs >= 200 ? "elevated" :
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

        const healthSignalDigest = createHash("sha256")
            .update([
                severity,
                healthSummaryCode,
                incidentClass,
                degradedComponents.join(","),
                criticalComponents.join(","),
                uniqueFailures.join(","),
                responseLatencyBucket,
                String(staleComponentCount),
                String(escalationSignalCount),
            ].join("|"))
            .digest("hex")
            .slice(0, 16);

        const healthSignalChanged = previousHealthSignalDigest !== healthSignalDigest;
        const healthSignalPreviousDigest = previousHealthSignalDigest;
        const healthSignalPreviousObservedAt = previousHealthSignalObservedAt;

        if (healthSignalChanged && previousHealthSignalDigest) {
            healthSignalTransitionCount = Math.min(
                HEALTH_SIGNAL_TRANSITION_COUNT_MAX,
                healthSignalTransitionCount + 1,
            );
        }

        if (!currentHealthSignalStableSince || healthSignalChanged) {
            currentHealthSignalStableSince = generatedAtIso;
        }

        const healthSignalStableSince = currentHealthSignalStableSince;
        const healthSignalStabilitySec = Math.max(
            0,
            Math.floor((generatedAtEpochMs - Date.parse(healthSignalStableSince ?? generatedAtIso)) / 1000),
        );

        const stabilityWindowMin = Math.max(1 / 60, healthSignalStabilitySec / 60);
        const healthSignalTransitionVelocityPerMin = Number.parseFloat(
            (healthSignalTransitionCount / stabilityWindowMin).toFixed(2),
        );

        const flappingByTransitionCount = healthSignalTransitionCount >= HEALTH_SIGNAL_FLAPPING_TRANSITION_THRESHOLD;
        const flappingByStabilityWindow = healthSignalStabilitySec <= HEALTH_SIGNAL_FLAPPING_STABILITY_WINDOW_SEC;

        const healthSignalFlapping = flappingByTransitionCount && flappingByStabilityWindow;

        const healthSignalFlappingReason =
            healthSignalFlapping
                ? "transition-threshold-and-stability-window"
                : flappingByTransitionCount
                    ? "transition-threshold-only"
                    : flappingByStabilityWindow
                        ? "stability-window-only"
                        : "none";

        const healthSignalVolatilityBand =
            healthSignalFlapping ? "volatile" :
            healthSignalTransitionCount >= Math.max(1, HEALTH_SIGNAL_FLAPPING_TRANSITION_THRESHOLD - 1) ? "watch" :
            "stable";

        const healthSignalTransitionCountCapped = healthSignalTransitionCount >= HEALTH_SIGNAL_TRANSITION_COUNT_MAX;
        const healthSignalTransitionCountRemaining = Math.max(
            0,
            HEALTH_SIGNAL_TRANSITION_COUNT_MAX - healthSignalTransitionCount,
        );

        const healthSignalTransitionUtilizationPct = Math.min(
            100,
            Math.max(
                0,
                Math.round((healthSignalTransitionCount / HEALTH_SIGNAL_TRANSITION_COUNT_MAX) * 100),
            ),
        );

        const healthSignalVolatilityScore = Math.min(
            100,
            Math.max(
                0,
                Math.round(
                    healthSignalTransitionUtilizationPct * 0.6 +
                    Math.min(100, healthSignalTransitionVelocityPerMin * 10) * 0.3 +
                    (healthSignalFlapping ? 10 : 0),
                ),
            ),
        );

        const healthSignalVolatilityTrend = previousHealthSignalVolatilityScore === null
            ? "steady"
            : healthSignalVolatilityScore > previousHealthSignalVolatilityScore
                ? "rising"
                : healthSignalVolatilityScore < previousHealthSignalVolatilityScore
                    ? "falling"
                    : "steady";

        const volatilityTrendConfidence =
            healthSignalTransitionCount >= 8 ? "high" :
            healthSignalTransitionCount >= 3 ? "medium" :
            "low";

        const volatilityAlertRecommended =
            healthSignalVolatilityBand === "volatile" && volatilityTrendConfidence !== "low";

        const volatilityAlertSeverityHint =
            !volatilityAlertRecommended ? "none" :
            healthSignalVolatilityScore >= 80 ? "page" :
            "watch";

        previousHealthSignalVolatilityScore = healthSignalVolatilityScore;

        previousHealthSignalDigest = healthSignalDigest;
        previousHealthSignalObservedAt = generatedAtIso;

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

        const contractBundleId = [
            `rev:${ADMIN_HEALTH_CONTRACT_REVISION}`,
            `shape:${ADMIN_HEALTH_RESPONSE_SHAPE_ID}`,
            `mode:${ADMIN_HEALTH_CONTRACT_COMPATIBILITY_MODE}`,
        ].join("|");

        const volatilityAlertPolicyBundleId = [
            `version:${ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_VERSION}`,
            `mode:${ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_MODE}`,
        ].join("|");

        const policyMismatchAlertPolicyBundleId = [
            `version:${ADMIN_HEALTH_POLICY_MISMATCH_ALERT_POLICY_VERSION}`,
            `mode:${ADMIN_HEALTH_POLICY_MISMATCH_ALERT_POLICY_MODE}`,
        ].join("|");

        const volatilityPolicyCompatible =
            ADMIN_HEALTH_CONTRACT_COMPATIBILITY_MODE === "strict"
                ? volatilityAlertPolicyBundleId.includes(`version:${ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_VERSION}`)
                : true;

        const volatilityPolicyCompatibilityReason =
            volatilityPolicyCompatible
                ? "compatible"
                : ADMIN_HEALTH_CONTRACT_COMPATIBILITY_MODE === "strict"
                    ? "missing-policy-version-in-bundle"
                    : "contract-mode-not-strict";

        const policyMismatchAlertPolicyCompatible =
            ADMIN_HEALTH_CONTRACT_COMPATIBILITY_MODE === "strict"
                ? policyMismatchAlertPolicyBundleId.includes(`version:${ADMIN_HEALTH_POLICY_MISMATCH_ALERT_POLICY_VERSION}`)
                : true;

        const policyMismatchAlertPolicyCompatibilityReason =
            policyMismatchAlertPolicyCompatible
                ? "compatible"
                : ADMIN_HEALTH_CONTRACT_COMPATIBILITY_MODE === "strict"
                    ? "missing-policy-version-in-bundle"
                    : "contract-mode-not-strict";

        const volatilityPolicyCompatibilityAction =
            volatilityPolicyCompatibilityReason === "compatible"
                ? "no-action"
                : volatilityPolicyCompatibilityReason === "missing-policy-version-in-bundle"
                    ? "verify-bundle-config"
                    : "update-monitor-policy";

        const policyMismatches = [
            !volatilityPolicyCompatible ? "volatility-policy" : null,
        ].filter((value): value is string => Boolean(value)).sort();

        const policyMismatchCount = policyMismatches.length;

        const policyMismatchDigest = createHash("sha256")
            .update([
                policyMismatches.join(","),
                policyMismatchRecommendedActions.join(","),
                volatilityPolicyCompatibilityReason,
                volatilityPolicyCompatibilityAction,
            ].join("|"))
            .digest("hex")
            .slice(0, 16);

        const policyMismatchChanged = previousPolicyMismatchDigest !== policyMismatchDigest;
        const policyMismatchPreviousDigest = previousPolicyMismatchDigest;

        if (policyMismatchChanged && policyMismatchPreviousDigest) {
            policyMismatchTransitionCount += 1;
        }

        if (!currentPolicyMismatchStableSince || policyMismatchChanged) {
            currentPolicyMismatchStableSince = generatedAtIso;
        }

        const policyMismatchStableSince = currentPolicyMismatchStableSince;
        const policyMismatchStabilitySec = Math.max(
            0,
            Math.floor((generatedAtEpochMs - Date.parse(policyMismatchStableSince ?? generatedAtIso)) / 1000),
        );

        const policyMismatchStabilityWindowMin = Math.max(1 / 60, policyMismatchStabilitySec / 60);
        const policyMismatchTransitionVelocityPerMin = Number.parseFloat(
            (policyMismatchTransitionCount / policyMismatchStabilityWindowMin).toFixed(2),
        );

        const policyMismatchVolatilityBand =
            policyMismatchTransitionCount >= 5 ? "volatile" :
            policyMismatchTransitionCount >= 2 ? "watch" :
            "stable";

        const policyMismatchVolatilityScore = Math.min(
            100,
            Math.max(
                0,
                Math.round(
                    Math.min(100, policyMismatchTransitionVelocityPerMin * 10) * 0.6 +
                    Math.min(100, policyMismatchTransitionCount * 10) * 0.4,
                ),
            ),
        );

        const policyMismatchVolatilityAlertRecommended =
            policyMismatchVolatilityBand === "volatile" || policyMismatchVolatilityScore >= 70;

        const policyMismatchVolatilityAlertSeverityHint =
            !policyMismatchVolatilityAlertRecommended
                ? "none"
                : policyMismatchVolatilityScore >= 85
                    ? "page"
                    : "watch";

        previousPolicyMismatchDigest = policyMismatchDigest;

        const policyMismatchRecommendedActions = policyMismatches
            .map((mismatch) =>
                mismatch === "volatility-policy" ? "update-monitor-policy" : "review-policy-config",
            )
            .sort();

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
            checkFailureCount: true,
            checkFailureNamesCsv: true,
            degradedComponentCount: true,
            degradedComponentNamesCsv: true,
            criticalComponentCount: true,
            criticalComponentNamesCsv: true,
            opsEscalationRequired: true,
            opsEscalationReason: true,
            opsEscalationFingerprint: true,
            escalationSignalCount: true,
            escalationSignalNamesCsv: true,
            healthSignalDigest: true,
            healthSignalChanged: true,
            healthSignalPreviousDigest: true,
            healthSignalPreviousObservedAt: true,
            healthSignalStableSince: true,
            healthSignalStabilitySec: true,
            healthSignalTransitionCount: true,
            healthSignalTransitionCountCapped: true,
            healthSignalTransitionCountRemaining: true,
            healthSignalTransitionUtilizationPct: true,
            healthSignalTransitionVelocityPerMin: true,
            healthSignalFlapping: true,
            healthSignalFlappingReason: true,
            healthSignalVolatilityBand: true,
            healthSignalVolatilityScore: true,
            healthSignalVolatilityTrend: true,
            volatilityTrendConfidence: true,
            volatilityAlertRecommended: true,
            volatilityAlertSeverityHint: true,
            volatilityAlertPolicyVersion: true,
            volatilityAlertPolicyBundleId: true,
            volatilityPolicyCompatible: true,
            volatilityPolicyCompatibilityReason: true,
            volatilityPolicyCompatibilityAction: true,
            policyMismatchCount: true,
            policyMismatchNamesCsv: true,
            policyMismatchRecommendedActionCsv: true,
            policyMismatchDigest: true,
            policyMismatchChanged: true,
            policyMismatchPreviousDigest: true,
            policyMismatchStableSince: true,
            policyMismatchStabilitySec: true,
            policyMismatchTransitionCount: true,
            policyMismatchTransitionVelocityPerMin: true,
            policyMismatchVolatilityBand: true,
            policyMismatchVolatilityScore: true,
            policyMismatchVolatilityAlertRecommended: true,
            policyMismatchVolatilityAlertSeverityHint: true,
            policyMismatchAlertPolicyVersion: true,
            policyMismatchAlertPolicyBundleId: true,
            policyMismatchAlertPolicyCompatible: true,
            policyMismatchAlertPolicyCompatibilityReason: true,
            incidentClass: true,
            incidentRoutingHint: true,
            alertSuppressionHint: true,
            opsReadinessScore: true,
            opsReadinessBand: true,
            contractRevision: true,
            contractCompatibilityMode: true,
            responseShapeId: true,
            contractBundleId: true,
            healthPayloadCompressionHint: true,
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
                contractRevision: ADMIN_HEALTH_CONTRACT_REVISION,
                contractCompatibilityMode: ADMIN_HEALTH_CONTRACT_COMPATIBILITY_MODE,
                responseShapeId: ADMIN_HEALTH_RESPONSE_SHAPE_ID,
                contractBundleId,
                healthPayloadCompressionHint: "full",
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
                opsEscalationFingerprint,
                escalationSignalCount,
                escalationSignalNamesCsv: escalationSignalNames.join(","),
                healthSignalDigest,
                healthSignalChanged,
                healthSignalPreviousDigest,
                healthSignalPreviousObservedAt,
                healthSignalStableSince,
                healthSignalStabilitySec,
                healthSignalTransitionCount,
                healthSignalTransitionCountCapped,
                healthSignalTransitionCountRemaining,
                healthSignalTransitionUtilizationPct,
                healthSignalTransitionVelocityPerMin,
                healthSignalFlapping,
                healthSignalFlappingReason,
                healthSignalVolatilityBand,
                healthSignalVolatilityScore,
                healthSignalVolatilityTrend,
                volatilityTrendConfidence,
                volatilityAlertRecommended,
                volatilityAlertSeverityHint,
                volatilityAlertPolicyVersion: ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_VERSION,
                volatilityAlertPolicyBundleId,
                volatilityPolicyCompatible,
                volatilityPolicyCompatibilityReason,
                volatilityPolicyCompatibilityAction,
                policyMismatchCount,
                policyMismatchNamesCsv: policyMismatches.join(",") || "none",
                policyMismatchRecommendedActionCsv: policyMismatchRecommendedActions.join(",") || "none",
                policyMismatchDigest,
                policyMismatchChanged,
                policyMismatchPreviousDigest,
                policyMismatchStableSince,
                policyMismatchStabilitySec,
                policyMismatchTransitionCount,
                policyMismatchTransitionVelocityPerMin,
                policyMismatchVolatilityBand,
                policyMismatchVolatilityScore,
                policyMismatchVolatilityAlertRecommended,
                policyMismatchVolatilityAlertSeverityHint,
                policyMismatchAlertPolicyVersion: ADMIN_HEALTH_POLICY_MISMATCH_ALERT_POLICY_VERSION,
                policyMismatchAlertPolicyBundleId,
                policyMismatchAlertPolicyCompatible,
                policyMismatchAlertPolicyCompatibilityReason,
                timestamp: generatedAtIso,
                checkStartedAtEpochMs: startedAt,
                generatedAtEpochMs,
                checkDurationMs,
                responseLatencyBucket,
                diagnosticDataFreshnessSec,
                checkFailures: uniqueFailures,
                checkFailureCount: uniqueFailures.length,
                checkFailureNamesCsv: uniqueFailures.join(",") || "none",
                degradedComponents,
                degradedComponentCount,
                degradedComponentNamesCsv: degradedComponents.join(",") || "none",
                criticalComponentCount,
                criticalComponentNamesCsv: criticalComponents.join(",") || "none",
                recommendedActions,
                runbookUrls: [...new Set(runbookUrls)].sort(),
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
