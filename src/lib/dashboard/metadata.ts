import type { Prisma } from "@prisma/client";
import type { DashboardDocContent, DashboardDocStatus } from "./types";

const DOC_STATUSES = new Set<DashboardDocStatus>(["DRAFT", "REVIEW", "APPROVED"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeDocStatus(value: unknown): DashboardDocStatus {
  return typeof value === "string" && DOC_STATUSES.has(value as DashboardDocStatus)
    ? (value as DashboardDocStatus)
    : "DRAFT";
}

export function readTeamLockApproved(config: Prisma.JsonValue | null | undefined): boolean {
  return isRecord(config) && config.lockApproved === true;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseDocMetadata(metadata: Prisma.JsonValue | null | undefined): Pick<DashboardDocContent, "hasProposedChanges" | "proposedAt"> {
  if (!isRecord(metadata)) return { hasProposedChanges: false };

  return {
    hasProposedChanges: metadata.proposedContent !== undefined && metadata.proposedContent !== null,
    proposedAt: readString(metadata.proposedAt),
  };
}

export function parseDocumentationContent({
  content,
  status,
  verifiedAt,
  verifiedById,
  metadata,
  lockApproved,
}: {
  content: string;
  status: DashboardDocStatus;
  verifiedAt?: Date | null;
  verifiedById?: string | null;
  metadata?: Prisma.JsonValue | null;
  lockApproved: boolean;
}): DashboardDocContent | null {
  try {
    const parsed = JSON.parse(content) as Partial<DashboardDocContent>;
    const meta = parseDocMetadata(metadata);

    return {
      ...parsed,
      summary: typeof parsed.summary === "string" ? parsed.summary : "No summary available.",
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      status,
      verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
      verifiedById: verifiedById ?? null,
      lockApproved,
      hasProposedChanges: meta.hasProposedChanges,
      proposedAt: meta.proposedAt,
    };
  } catch {
    return null;
  }
}
