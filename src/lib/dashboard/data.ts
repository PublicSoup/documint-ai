import type { Prisma } from "@prisma/client";

import { logAudit } from "@/lib/audit-logger";
import { db } from "@/lib/db";
import { normalizeDocStatus, parseDocumentationContent, readTeamLockApproved } from "./metadata";
import type {
  DashboardFile,
  DashboardFileStats,
  DashboardScope,
  DashboardTeamMembership,
  SelectedDashboardDocument,
} from "./types";

type FileWithDocumentation = Prisma.FileGetPayload<{ include: { documentation: true } }>;

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
