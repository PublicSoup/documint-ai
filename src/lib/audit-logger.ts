import { db } from "@/lib/db";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
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
    ip
}: {
    action: string;
    entity: string;
    entityId: string;
    userId?: string | null;
    details?: Record<string, unknown>;
    ip?: string | null;
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
                createdAt: timestamp
            }
        });
    } catch (error) {
        console.error("Failed to create audit log:", error);
    }
}
