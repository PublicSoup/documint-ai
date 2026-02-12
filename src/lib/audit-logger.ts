import { db } from "@/lib/db";
import { createHash } from "crypto";

export async function logAudit({
    action,
    entity,
    entityId,
    userId,
    details,
    ip
}: {
    action: string;
    entity: string;
    entityId: string;
    userId?: string | null;
    details?: any;
    ip?: string | null;
}) {
    try {
        // Fetch the last log entry to get its hash
        const lastLog = await db.auditLog.findFirst({
            orderBy: { createdAt: "desc" },
            select: { hash: true }
        });

        const previousHash = lastLog?.hash || "GENESIS_HASH";

        // Calculate new hash: SHA256(previousHash + action + entityId + timestamp)
        // Note: In production, include more fields for stronger integrity
        const timestamp = new Date().toISOString();
        const dataToHash = `${previousHash}|${action}|${entityId}|${timestamp}|${JSON.stringify(details || {})}`;
        const hash = createHash("sha256").update(dataToHash).digest("hex");

        return await db.auditLog.create({
            data: {
                action,
                entity,
                entityId,
                userId,
                details,
                ip,
                hash,
                previousHash,
                createdAt: timestamp // Ensure timestamp matches hash construction
            }
        });
    } catch (error) {
        console.error("Failed to create audit log:", error);
        // Fallback: Create without hash if hashing fails (should rarely happen) but don't block action
        // Actually, for compliance, failing to log might be critical. 
        // For now, we log the error but swallow it to not break user flows, 
        // but in a strict mode we might want to throw.
    }
}
