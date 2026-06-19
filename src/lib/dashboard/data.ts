import type { Prisma } from "@prisma/client";

import { logAudit } from "@/lib/audit-logger";
import { db } from "@/lib/db";
import { listCodebasesForUser } from "@/lib/codebases/queries";
import { hasFeatureAccess } from "@/lib/subscription";
import { normalizeDocStatus, parseDocumentationContent, readTeamLockApproved } from "./metadata";
import type {
  DashboardFile,
  DashboardFileStats,
  DashboardScope,
  DashboardTeamMembership,
  IdeActivityEntry,
  IdeActivitySeverity,
  MonitoringCodebase,
  ProjectMonitoringData,
  SelectedDashboardDocument,
} from "./types";

const IDE_AUDIT_ACTIONS = ["IDE_SANDBOX_RUN", "IDE_SANDBOX_COMMAND"] as const;

type FileWithDocumentation = Prisma.FileGetPayload<{ include: { documentation: true } }>;
type IdeAuditLogRow = Prisma.AuditLogGetPayload<{
  select: { id: true; action: true; details: true; severity: true; createdAt: true };
}>;

function mapDashboardFile(file: FileWithDocumentation): DashboardFile {
  return {
    id: file.id,
    name: file.name,
    language: file.language,
    size: file.size,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    documentation: file.documentation
      ? {
          content: file.documentation.content,
          verifiedAt: file.documentation.verifiedAt,
          verifiedById: file.documentation.verifiedById,
          isPublic: file.documentation.isPublic,
          status: normalizeDocStatus(file.documentation.status),
          metadata: file.documentation.metadata,
        }
      : null,
  };
}

export async function resolveDashboardScope(userId: string, requestedTeamId?: string): Promise<DashboardScope> {
  const memberships = (await db.teamMember.findMany({
    where: { userId },
    include: { team: true },
  })) as DashboardTeamMembership[];

  const teams = memberships.map((membership) => membership.team);
  const activeMembership = requestedTeamId
    ? memberships.find((membership) => membership.teamId === requestedTeamId)
    : undefined;

  if (requestedTeamId && !activeMembership) {
    return {
      memberships,
      teams,
      teamId: undefined,
      userRole: "OWNER",
      where: { userId, teamId: null },
      invalidTeamRequest: true,
    };
  }

  if (activeMembership) {
    return {
      memberships,
      teams,
      teamId: activeMembership.teamId,
      userRole: activeMembership.role,
      where: { teamId: activeMembership.teamId },
      invalidTeamRequest: false,
    };
  }

  return {
    memberships,
    teams,
    teamId: undefined,
    userRole: "OWNER",
    where: { userId, teamId: null },
    invalidTeamRequest: false,
  };
}

export async function getDashboardFileStats(where: Prisma.FileWhereInput, selectedDocId?: string): Promise<DashboardFileStats> {
  const [totalFilesCount, verifiedDocsCount, fetchedFiles, selectedDeepLinkFile] = await Promise.all([
    db.file.count({ where }),
    db.documentation.count({
      where: {
        file: where,
        verifiedAt: { not: null },
      },
    }),
    db.file.findMany({
      where,
      take: 50,
      orderBy: { updatedAt: "desc" },
      include: { documentation: true },
    }),
    selectedDocId
      ? db.file.findFirst({
          where: { AND: [{ id: selectedDocId }, where] },
          include: { documentation: true },
        })
      : Promise.resolve(null),
  ]);

  const files = selectedDeepLinkFile && !fetchedFiles.some((file: FileWithDocumentation) => file.id === selectedDeepLinkFile.id)
    ? [selectedDeepLinkFile, ...fetchedFiles]
    : fetchedFiles;

  return {
    totalFilesCount,
    verifiedDocsCount,
    files: files.map(mapDashboardFile),
  };
}

async function getTeamLockApproved(teamId?: string): Promise<boolean> {
  if (!teamId) return false;

  const teamConfig = await db.integration.findFirst({
    where: { teamId, type: "TEAM_CONFIG" },
    select: { config: true },
  });

  return readTeamLockApproved(teamConfig?.config);
}

export async function getSelectedDashboardDocument({
  files,
  selectedDocId,
  teamId,
  userId,
}: {
  files: DashboardFile[];
  selectedDocId?: string;
  teamId?: string;
  userId: string;
}): Promise<SelectedDashboardDocument> {
  if (!selectedDocId) return { selectedFile: null, parsedDoc: null };

  const selectedFile = files.find((file) => file.id === selectedDocId) ?? null;
  const documentation = selectedFile?.documentation;

  if (!selectedFile || !documentation) {
    return { selectedFile, parsedDoc: null };
  }

  const lockApproved = await getTeamLockApproved(teamId);

  void logAudit({
    userId,
    action: "VIEW_DOCS",
    entity: "Documentation",
    entityId: selectedFile.id,
    details: { name: selectedFile.name },
  }).catch(() => undefined);

  return {
    selectedFile,
    parsedDoc: parseDocumentationContent({
      content: documentation.content,
      status: documentation.status,
      verifiedAt: documentation.verifiedAt,
      verifiedById: documentation.verifiedById,
      metadata: documentation.metadata,
      lockApproved,
    }),
  };
}

/**
 * Best-effort codebase (project) monitoring data for the Overview tab.
 *
 * Returns the most recently active codebases plus the total count. Never
 * throws — a failure (e.g. metadata column missing) degrades to an empty
 * result so the dashboard still renders.
 */
export async function getProjectMonitoringData(
  userId: string,
  teamId?: string,
): Promise<ProjectMonitoringData> {
  try {
    const [codebaseResult, ide] = await Promise.all([
      listCodebasesForUser(
        userId,
        { sort: "recent", take: 12 },
        { teamId: teamId ?? null, requesterId: userId },
      ),
      getIdeActivity(userId, 8),
    ]);

    const codebases: MonitoringCodebase[] = codebaseResult.items.map((item) => ({
      id: item.id,
      name: item.name,
      source: item.source,
      language: item.language,
      fileCount: item.fileCount,
      totalSizeBytes: item.totalSizeBytes,
      hasDocs: item.hasDocs,
      docsVerified: item.docsVerified,
      lastActivityAt: item.lastActivityAt.toISOString(),
      archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    }));

    return {
      codebases,
      totalCount: codebaseResult.totalCount,
      ideRuns7d: ide.ideRuns7d,
      ideActivity: ide.ideActivity,
    };
  } catch {
    return { codebases: [], totalCount: 0, ideRuns7d: 0, ideActivity: [] };
  }
}

/**
 * IDE monitoring data derived from the audit log. IDE sandbox runs/commands
 * are logged as `IDE_SANDBOX_RUN` / `IDE_SANDBOX_COMMAND`, so this surfaces
 * recent IDE activity plus a 7-day run count. Live build/preview status is
 * ephemeral (not persisted), so this is activity-based, not state-based.
 *
 * Feature-gate aware: returns empty if the user lacks audit-log access.
 * Never throws.
 */
export async function getIdeActivity(
  userId: string,
  limit = 8,
): Promise<{ ideRuns7d: number; ideActivity: IdeActivityEntry[] }> {
  try {
    const canReadAudit = await hasFeatureAccess(userId, "auditLog").catch(() => false);
    if (!canReadAudit) return { ideRuns7d: 0, ideActivity: [] };

    // AuditLog is userId-scoped (no teamId column); surface this user's IDE runs.
    const where: Prisma.AuditLogWhereInput = {
      action: { in: [...IDE_AUDIT_ACTIONS] },
      userId,
    };
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [rows, ideRuns7d] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, action: true, details: true, severity: true, createdAt: true },
      }),
      db.auditLog.count({ where: { ...where, createdAt: { gte: sevenDaysAgo } } }),
    ]);

    const ideActivity: IdeActivityEntry[] = rows.map((row: IdeAuditLogRow) => ({
      id: row.id,
      action: row.action,
      label: describeIdeAuditAction(row.action, row.details),
      createdAt: row.createdAt.toISOString(),
      severity: normalizeIdeSeverity(row.severity),
    }));

    return { ideRuns7d, ideActivity };
  } catch {
    return { ideRuns7d: 0, ideActivity: [] };
  }
}

function describeIdeAuditAction(action: string, details: Prisma.JsonValue): string {
  const meta = (details ?? {}) as Record<string, unknown>;
  const command = typeof meta.command === "string" ? meta.command : null;
  const language = typeof meta.language === "string" ? meta.language : null;

  if (action === "IDE_SANDBOX_COMMAND" && command) {
    return language ? `${language} · ${command}` : command;
  }
  if (action === "IDE_SANDBOX_RUN") {
    return language ? `Ran ${language} sandbox` : "Sandbox run";
  }
  return "IDE activity";
}

function normalizeIdeSeverity(severity: string | null): IdeActivitySeverity {
  switch ((severity ?? "").toUpperCase()) {
    case "ERROR":
    case "CRITICAL":
      return "error";
    case "WARNING":
    case "WARN":
      return "warning";
    case "INFO":
      return "info";
    default:
      return "success";
  }
}
