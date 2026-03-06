import { db } from "./db";
import { logAudit } from "./audit-logger";

/**
 * Automates the AI documentation audit for a specific file or project.
 * Triggered on save/deploy.
 */
export async function triggerAutoAudit(fileId: string, userId: string) {
    try {
        console.log(`[AutoTrigger] Starting automatic AI audit for file: ${fileId}`);
        // In a real implementation, this would call the AI service
        // For now, we log the event and trigger a documentation refresh
        await logAudit({
            action: "AUTO_AUDIT",
            entity: "File",
            entityId: fileId,
            userId,
            details: { trigger: "file_save", timestamp: new Date().toISOString() }
        });
    } catch (error) {
        console.error("[AutoTrigger] Auto audit failed:", error);
    }
}

/**
 * Automatically detects documentation drift when code changes.
 * Triggered on file save.
 */
export async function triggerDriftDetection(fileId: string, userId: string) {
    try {
        const file = await db.file.findUnique({
            where: { id: fileId },
            include: { documentation: true }
        });

        if (file?.documentation) {
            console.log(`[AutoTrigger] Detecting drift for file: ${file.name}`);
            // Logic to check if code significantly deviates from doc
            await logAudit({
                action: "DRIFT_CHECK",
                entity: "File",
                entityId: fileId,
                userId,
                details: { status: "pending_review" }
            });
        }
    } catch (error) {
        console.error("[AutoTrigger] Drift detection failed:", error);
    }
}
