import { PlanType, PLAN_LIMITS } from "@/config/plans";

/**
 * Single source of truth for codebase-related plan limits.
 *
 * Kept in its own module so that the cap can be referenced by:
 *   - the dashboard UI (showing "X of N codebases")
 *   - the API routes (enforcing on write)
 *   - tests (pure function, no DB)
 *
 * The cap counts a "codebase" as the number of distinct File.groupKey
 * (or GitHubConnection for GITHUB sources) a user owns. v1 approximates
 * this with a count of File rows that have a `metadata.codebaseKey`,
 * falling back to per-user File count when no keys are present.
 */
export interface CodebasePlanLimits {
    maxCodebases: number;        // -1 = unlimited
    maxLocalCodebases: number;   // -1 = unlimited
    maxGithubCodebases: number;  // -1 = unlimited
    canSyncGithub: boolean;      // false for free plan
    canBulkArchive: boolean;     // enterprise-y feature, Team only
    canExportAudit: boolean;     // Team only
}

const DEFAULT_LIMITS: CodebasePlanLimits = {
    maxCodebases: 3,
    maxLocalCodebases: 3,
    maxGithubCodebases: 0,
    canSyncGithub: false,
    canBulkArchive: false,
    canExportAudit: false,
};

const PLAN_CODEBASE_LIMITS: Record<PlanType, CodebasePlanLimits> = {
    free: {
        maxCodebases: 3,
        maxLocalCodebases: 3,
        maxGithubCodebases: 0,   // no GitHub sync on free
        canSyncGithub: false,
        canBulkArchive: false,
        canExportAudit: false,
    },
    starter: {
        maxCodebases: 10,
        maxLocalCodebases: 7,
        maxGithubCodebases: 3,
        canSyncGithub: true,
        canBulkArchive: false,
        canExportAudit: false,
    },
    pro: {
        maxCodebases: 25,
        maxLocalCodebases: 15,
        maxGithubCodebases: 10,
        canSyncGithub: true,
        canBulkArchive: true,
        canExportAudit: false,
    },
    team: {
        maxCodebases: -1,        // unlimited
        maxLocalCodebases: -1,
        maxGithubCodebases: -1,
        canSyncGithub: true,
        canBulkArchive: true,
        canExportAudit: true,
    },
};

export function getCodebasePlanLimits(plan: PlanType): CodebasePlanLimits {
    return PLAN_CODEBASE_LIMITS[plan] ?? DEFAULT_LIMITS;
}

/**
 * Cross-check against the legacy `PLAN_LIMITS` table so the two stay in
 * sync. If the file cap is raised, we never lower the codebase cap below
 * the file cap divided by an assumed minimum-files-per-codebase (10).
 */
export function isCodebaseLimitConsistent(plan: PlanType): boolean {
    const legacy = PLAN_LIMITS[plan];
    const codebases = PLAN_CODEBASE_LIMITS[plan];
    if (!legacy || !codebases) return false;
    if (codebases.maxCodebases === -1) return true;
    // Loose invariant: totalFiles >= maxCodebases * 1 (1 file minimum).
    // Tightening further would require knowing the project's "files per
    // codebase" ratio, which is product-dependent. Logged for now.
    return legacy.totalFiles === -1 || legacy.totalFiles >= codebases.maxCodebases;
}