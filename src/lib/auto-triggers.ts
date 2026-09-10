import { logAudit } from "./audit-logger";
import { autoDocumentFile } from "./auto-documentation";
import { analyzeAndPersistFile } from "./deterministic-analysis";
import { autoReviewDocumentation } from "./doc-review";

/**
 * Event-driven automation for workspace files. These run fire-and-forget from
 * the file-save routes (`/api/code/edit`, `/api/files/[fileId]/raw`), so they
 * must be resilient and never throw.
 */

/**
 * Automatically generates documentation for a file on save.
 *
 * This is a no-op for files that are already documented (see
 * {@link autoDocumentFile}'s idempotency guard), so it is cheap to fire on every
 * save — only genuinely undocumented files trigger an AI run.
 */
export async function triggerAutoAudit(fileId: string, userId: string) {
    // 1. Deterministic analysis — always runs, no AI. This is what keeps the
    //    dashboard coverage/quality/risk panels populated on Railway (or any
    //    time the AI backend is unavailable).
    let insightUpdated = false;
    try {
        const insight = await analyzeAndPersistFile(fileId);
        insightUpdated = insight !== null;
    } catch (error) {
        console.error("[AutoTrigger] Deterministic analysis failed:", error);
    }

    // 2. Best-effort AI documentation enrichment. When no AI provider is
    //    configured, autoDocumentFile short-circuits before any network call and
    //    persists nothing, so this is cheap and safe to always attempt.
    try {
        const result = await autoDocumentFile(fileId, userId, { reason: "file_save" });

        try {
            await logAudit({
                action: "AUTO_AUDIT",
                entity: "File",
                entityId: fileId,
                userId,
                details: {
                    trigger: "file_save",
                    status: result.status,
                    insightUpdated,
                    timestamp: new Date().toISOString(),
                },
            });
        } catch {
            // Non-blocking.
        }
    } catch (error) {
        console.error("[AutoTrigger] Auto audit failed:", error);
    }
}

/**
 * Throttle repeated drift checks for the same file. The check is now
 * deterministic (cheap), but re-parsing on every keystroke-save is wasteful, so
 * we still skip re-checking a file examined very recently. Best-effort per-instance.
 */
const DRIFT_THROTTLE_MS = 60 * 1000;
const lastDriftCheck = new Map<string, number>();

/**
 * Deterministic documentation review: detects whether the docs are stale/drifted
 * (code changed after the doc, or the exported symbols changed) and, if so, flags
 * the doc for review (surfaces as OUT_OF_SYNC / REVIEW in the dashboard). No AI —
 * works on Railway and is instant. See {@link autoReviewDocumentation}.
 */
export async function triggerDriftDetection(fileId: string, userId: string) {
    try {
        const now = Date.now();
        const previous = lastDriftCheck.get(fileId) ?? 0;
        if (now - previous < DRIFT_THROTTLE_MS) return;
        lastDriftCheck.set(fileId, now);

        const result = await autoReviewDocumentation(fileId);
        // Nothing to drift from until the file has documentation.
        if (!result.hasDoc) return;

        try {
            await logAudit({
                action: "DRIFT_CHECK",
                entity: "File",
                entityId: fileId,
                userId,
                details: {
                    method: "deterministic",
                    drifted: result.stale,
                    docScore: result.docScore,
                    status: result.stale ? "review_required" : "in_sync",
                    issues: result.issues,
                },
            });
        } catch {
            // Non-blocking.
        }
    } catch (error) {
        console.error("[AutoTrigger] Drift detection failed:", error);
    }
}
