import { db } from "./db";
import { logAudit } from "./audit-logger";
import { getFileContent } from "./files";
import { autoDocumentFile } from "./auto-documentation";
import { detectIntentDrift } from "./ai";

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
 * Throttle repeated drift checks for the same file. Drift detection is an AI
 * call and only matters once documentation exists, so we skip re-checking a file
 * that was checked very recently (e.g. during a burst of rapid saves). Best-effort
 * per-instance only.
 */
const DRIFT_THROTTLE_MS = 5 * 60 * 1000;
const lastDriftCheck = new Map<string, number>();

/**
 * Detects whether code has drifted away from its existing documentation and, if
 * so, flags the doc for review (which surfaces as OUT_OF_SYNC in analytics).
 */
export async function triggerDriftDetection(fileId: string, userId: string) {
    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true },
        });

        // Nothing to drift from until the file has documentation. (On a brand-new
        // file's first save, `triggerAutoAudit` creates the docs; drift checks
        // begin on subsequent saves.)
        if (!file?.documentation) return;

        const now = Date.now();
        const previous = lastDriftCheck.get(fileId) ?? 0;
        if (now - previous < DRIFT_THROTTLE_MS) return;
        lastDriftCheck.set(fileId, now);

        const content = await getFileContent(fileId);
        if (!content || !content.trim()) return;

        // Compare against the human-readable summary when the stored doc is our
        // structured JSON; fall back to the raw content otherwise.
        let documentedIntent = file.documentation.content;
        try {
            const parsed = JSON.parse(file.documentation.content) as { summary?: string };
            if (parsed.summary) documentedIntent = parsed.summary;
        } catch {
            // Stored documentation is plain text — compare against it directly.
        }

        const { drifted, reasoning } = await detectIntentDrift(content, documentedIntent);

        if (drifted && file.documentation.status !== "REVIEW") {
            await db.documentation.update({
                where: { fileId },
                data: { status: "REVIEW" },
            });
        }

        try {
            await logAudit({
                action: "DRIFT_CHECK",
                entity: "File",
                entityId: fileId,
                userId,
                details: {
                    drifted,
                    reasoning: reasoning ?? null,
                    status: drifted ? "review_required" : "in_sync",
                },
            });
        } catch {
            // Non-blocking.
        }
    } catch (error) {
        console.error("[AutoTrigger] Drift detection failed:", error);
    }
}
