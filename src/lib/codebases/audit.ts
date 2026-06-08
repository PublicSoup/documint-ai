import { AuditLogSeverity } from "@prisma/client";
import { logAudit } from "@/lib/audit-logger";

/**
 * Strongly-typed action codes for codebase-related audit events.
 *
 * Keeping these as a const object (rather than free-form strings) means a
 * typo at a call site is a TypeScript error rather than a silent gap in
 * the audit log.
 */
export const CODEBASE_ACTIONS = {
    LIST: "CODEBASE_LIST",
    VIEW: "CODEBASE_VIEW",
    CREATE: "CODEBASE_CREATE",
    RENAME: "CODEBASE_RENAME",
    ARCHIVE: "CODEBASE_ARCHIVE",
    RESTORE: "CODEBASE_RESTORE",
    DELETE: "CODEBASE_DELETE",
    BULK_ARCHIVE: "CODEBASE_BULK_ARCHIVE",
    SYNC_TRIGGER: "CODEBASE_SYNC_TRIGGER",
    SYNC_COMPLETE: "CODEBASE_SYNC_COMPLETE",
    SYNC_FAILED: "CODEBASE_SYNC_FAILED",
    PLAN_LIMIT_BLOCKED: "CODEBASE_PLAN_LIMIT_BLOCKED",
} as const;

export type CodebaseAction = (typeof CODEBASE_ACTIONS)[keyof typeof CODEBASE_ACTIONS];

interface CodebaseAuditInput {
    userId: string;
    action: CodebaseAction;
    codebaseId: string;
    teamId?: string | null;
    details?: Record<string, unknown>;
    severity?: AuditLogSeverity;
}

function severityFor(action: CodebaseAction): AuditLogSeverity {
    switch (action) {
        case CODEBASE_ACTIONS.SYNC_FAILED:
        case CODEBASE_ACTIONS.PLAN_LIMIT_BLOCKED:
            return AuditLogSeverity.WARNING;
        case CODEBASE_ACTIONS.DELETE:
        case CODEBASE_ACTIONS.BULK_ARCHIVE:
            return AuditLogSeverity.WARNING;
        default:
            return AuditLogSeverity.INFO;
    }
}

/**
 * Write a single audit log row for a codebase action.
 *
 * Thin wrapper over the global `logAudit` so the entity name and severity
 * policy are consistent across call sites. Never throws — audit logging
 * must not break the user-facing action.
 */
export async function logCodebaseAudit(input: CodebaseAuditInput): Promise<void> {
    await logAudit({
        userId: input.userId,
        action: input.action,
        entity: "Codebase",
        entityId: input.codebaseId,
        severity: input.severity ?? severityFor(input.action),
        details: {
            ...(input.details ?? {}),
            ...(input.teamId ? { teamId: input.teamId } : {}),
            v: 1,
        },
    });
}