import type { Prisma } from "@prisma/client";
import type { DocContent, ProjectViewMode } from "@/components/doc-editor";

export type DashboardSearchParams = Record<string, string | string[] | undefined>;
export type DashboardDocStatus = DocContent["status"];

export interface DashboardDocumentation {
  content: string;
  verifiedAt?: Date | null;
  verifiedById?: string | null;
  isPublic: boolean;
  status: DashboardDocStatus;
  metadata?: Prisma.JsonValue | null;
}

export interface DashboardFile {
  id: string;
  name: string;
  language: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  documentation: DashboardDocumentation | null;
}

export interface DashboardTeam {
  id: string;
  name: string;
  slug: string;
  plan: string;
  updatedAt: Date;
}

export interface DashboardTeamMembership {
  teamId: string;
  role: string;
  team: DashboardTeam;
}

export interface DashboardScope {
  memberships: DashboardTeamMembership[];
  teams: DashboardTeam[];
  teamId?: string;
  userRole: string;
  where: Prisma.FileWhereInput;
  invalidTeamRequest: boolean;
}

export interface DashboardOnboardingContext {
  intent: "signup" | "trial";
  plan: "starter" | "pro" | "team" | null;
  source: string | null;
}

export type DashboardDocContent = DocContent & { lockApproved?: boolean };

export interface SelectedDashboardDocument {
  selectedFile: DashboardFile | null;
  parsedDoc: DashboardDocContent | null;
}

export interface DashboardFileStats {
  totalFilesCount: number;
  verifiedDocsCount: number;
  files: DashboardFile[];
}

export interface DashboardSessionUser {
  id: string;
  name: string;
}

/**
 * Serialized, client-safe projection of a codebase for the monitoring
 * dashboard. Mirrors the relevant fields of `CodebaseSummary` but with
 * ISO strings so it can cross the server→client boundary cleanly.
 */
export interface MonitoringCodebase {
  id: string;
  name: string;
  source: "LOCAL" | "GITHUB" | "UPLOAD";
  language: string | null;
  fileCount: number;
  totalSizeBytes: number;
  hasDocs: boolean;
  docsVerified: boolean;
  lastActivityAt: string;
  archivedAt: string | null;
}

export type IdeActivitySeverity = "info" | "success" | "warning" | "error";

export interface IdeActivityEntry {
  id: string;
  action: string;
  label: string;
  createdAt: string;
  severity: IdeActivitySeverity;
}

export interface ProjectMonitoringData {
  codebases: MonitoringCodebase[];
  totalCount: number;
  ideRuns7d: number;
  ideActivity: IdeActivityEntry[];
}

export type { ProjectViewMode };
