import { db } from "@/lib/db";
import { createHash } from "crypto";
import { Prisma, AuditLogSeverity } from "@prisma/client";
import { getClientIP, getUserAgent } from "@/lib/rate-limit";

/**
 * High-security regex to detect and mask common secrets/keys in audit metadata
 */
function maskSecrets(obj: Record<string, unknown>): Record<string, unknown> {
    if (!obj) return obj;
    const str = JSON.stringify(obj);

    // Mask common secret patterns: passwords, api keys, tokens, auth headers
    const masked = str.replace(
        /Bearer\s+([a-zA-Z0-9\._\-]{4})[a-zA-Z0-9\._\-]+/gi,
        'Bearer $1****'
    ).replace(
        /"([^"]*(?:password|api[_-]?key|secret|token|access[_-]?token|auth|stripe|sk_)[^"]*)"\s*:\s*"([^"']{4})[^"']+"/gi,
        (match, key, val) => {
            return `"${key}":"${val}****"`;
        }
    );

    try {
        return JSON.parse(masked);
    } catch {
        return obj; // Fallback to original if parsing fails
    }
}

export async function logAudit({
    action,
    entity,
    entityId,
    userId,
    details,
    ip,
    severity = AuditLogSeverity.INFO
}: {
    action: string;
    entity: string;
    entityId: string;
    userId?: string | null;
    details?: Record<string, unknown>;
    ip?: string | null;
    severity?: AuditLogSeverity;
}) {
    try {
        // Automatically resolve IP and User Agent if not provided
        const resolvedIp = ip || await getClientIP();
        const userAgent = await getUserAgent();

        // 1. Secret Masking: Ensure sensitive data never enters the high-integrity chain
        const safeDetails = maskSecrets({
            ...(details || {}),
            ua: userAgent
        });

        // 2. Fetch the last log entry to get its hash
        const lastLog = await db.auditLog.findFirst({
            orderBy: { createdAt: "desc" },
            select: { hash: true }
        });

        const previousHash = lastLog?.hash || "GENESIS_HASH";

        // 3. Calculate new hash: SHA256(previousHash | action | entityId | timestamp | details)
        const timestamp = new Date().toISOString();
        const dataToHash = `${previousHash}|${action}|${entityId}|${timestamp}|${JSON.stringify(safeDetails)}`;
        const hash = createHash("sha256").update(dataToHash).digest("hex");

        return await db.auditLog.create({
            data: {
                action,
                entity,
                entityId,
                userId,
                details: safeDetails as Prisma.InputJsonValue,
                ip: resolvedIp,
                hash,
                previousHash,
                createdAt: timestamp,
                severity
            }
        });
    } catch (error) {
        console.error("Failed to create audit log:", error);
    }
}

/**
 * Validates the audit log chain for tampering.
 * Returns true if the chain is intact, false otherwise.
 * Use for periodic compliance checks.
 */
export async function verifyAuditChain(entityId?: string): Promise<{ valid: boolean; brokenAtId?: string }> {
    const whereClause: Prisma.AuditLogWhereInput = entityId ? { entityId } : {};

    let lastHash = "GENESIS_HASH";
    let cursorId: string | undefined;
    const BATCH_SIZE = 500;

    while (true) {
        const logs = await db.auditLog.findMany({
            where: whereClause,
            orderBy: { createdAt: "asc" },
            take: BATCH_SIZE,
            cursor: cursorId ? { id: cursorId } : undefined,
            skip: cursorId ? 1 : 0,
        });

        if (logs.length === 0) break;

        for (const log of logs) {
            // Reconstruct the hash input
            // previousHash | action | entityId | timestamp | details (JSON string)
            const dataToHash = `${log.previousHash}|${log.action}|${log.entityId}|${log.createdAt.toISOString()}|${JSON.stringify(log.details)}`;
            const expectedHash = createHash("sha256").update(dataToHash).digest("hex");

            if (log.hash !== expectedHash) {
                console.error(`Audit Chain Broken at ID: ${log.id}. Expected: ${expectedHash}, Found: ${log.hash}`);
                return { valid: false, brokenAtId: log.id };
            }

            // Chain link check: Does this log point to the correct previous hash?
            if (lastHash !== "GENESIS_HASH" && log.previousHash !== lastHash) {
                console.error(`Audit Chain Link Broken at ID: ${log.id}. Previous Hash Mismatch.`);
                return { valid: false, brokenAtId: log.id };
            }

            lastHash = log.hash!;
            cursorId = log.id;
        }
    }

    return { valid: true };
}
