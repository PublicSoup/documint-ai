import { Suspense } from "react";

import type { Hotspot, PriorityAction } from "@/app/dashboard/actions";
import { CodebasesView } from "@/components/codebases/codebases-view";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";
import { CommandCenter } from "@/components/dashboard/command-center";
import { CommandCenterSkeleton } from "@/components/dashboard/command-center-skeleton";
import { ProjectExplorerCard } from "@/components/dashboard/project-explorer-card";
import { SelectedDocumentPanel } from "@/components/dashboard/selected-document-panel";
import { WorkspaceActionsCard } from "@/components/dashboard/workspace-actions-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TeamSwitcher from "@/components/team-switcher";
import UsageMeter from "@/components/usage-meter";
import type {
  DashboardDocContent,
  DashboardFile,
  DashboardSessionUser,
  DashboardTeam,
  ProjectMonitoringData,
  ProjectViewMode,
} from "@/lib/dashboard/types";

interface DashboardOverviewTabProps {
  teamId?: string;
  teams: DashboardTeam[];
  files: DashboardFile[];
  selectedDocId?: string;
  selectedFile: DashboardFile | null;
  parsedDoc: DashboardDocContent | null;
  initialProjectView: ProjectViewMode;
  currentUser: DashboardSessionUser & { role: string };
  isPro: boolean;
  priorityActions: PriorityAction[];
  hotspots: Hotspot[];
  totalFilesCount: number;
  verifiedDocsCount: number;
  codebasesViewEnabled: boolean;
  projectMonitoring: ProjectMonitoringData;
}

export function DashboardOverviewTab({
  teamId,
  teams,
  files,
  selectedDocId,
  selectedFile,
  parsedDoc,
  initialProjectView,
  currentUser,
  isPro,
  priorityActions,
  hotspots,
  totalFilesCount,
  verifiedDocsCount,
  codebasesViewEnabled,
  projectMonitoring,
}: DashboardOverviewTabProps) {
  const isEmpty = files.length === 0 && !codebasesViewEnabled;

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500">
      {isEmpty ? (
        // Onboarding state: the empty-state hero owns upload + GitHub import.
        // Show only a slim context sidebar alongside it (no WorkspaceActionsCard,
        // so there is exactly one GitHubImport instance on screen).
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
          <section className="lg:col-span-8">
            <DashboardEmptyState teamId={teamId} isPro={isPro} />
          </section>
          <aside className="lg:col-span-4 space-y-5">
            <ContextCard teams={teams} teamId={teamId} />
          </aside>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
          <aside className="space-y-5 xl:col-span-4 2xl:col-span-3">
            <WorkspaceActionsCard
              teamId={teamId}
              teams={teams}
              isPro={isPro}
            />
            <ProjectExplorerCard
              files={files}
              selectedFileId={selectedDocId}
              teamId={teamId}
            />
          </aside>

          <section className="flex min-w-0 flex-col gap-5 xl:col-span-8 2xl:col-span-9">
            {codebasesViewEnabled ? (
              <CodebasesView teamId={teamId ?? null} />
            ) : selectedDocId ? (
              <SelectedDocumentPanel
                selectedFile={selectedFile}
                parsedDoc={parsedDoc}
                initialView={initialProjectView}
                currentUser={currentUser}
                isPro={isPro}
                teamId={teamId}
              />
            ) : (
              <Suspense fallback={<CommandCenterSkeleton />}>
                <CommandCenter
                  teamId={teamId}
                  files={files.map((file) => ({
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
                          status: file.documentation.status,
                        }
                      : null,
                  }))}
                  priorityActions={priorityActions}
                  hotspots={hotspots}
                  totalFilesCount={totalFilesCount}
                  verifiedDocsCount={verifiedDocsCount}
                  projectMonitoring={projectMonitoring}
                />
              </Suspense>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Slim sidebar shown in the empty/onboarding state. Holds team context and
 * usage only — upload/import live in the DashboardEmptyState hero so they
 * are not duplicated.
 */
function ContextCard({
  teams,
  teamId,
}: {
  teams: DashboardTeam[];
  teamId?: string;
}) {
  return (
    <Card className="overflow-hidden border-white/10 bg-[#0d0d12]/95 shadow-xl shadow-black/20" hoverEffect={false}>
      <CardHeader className="border-b border-white/8 pb-4">
        <CardTitle className="text-sm font-semibold text-white">
          Current context
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <TeamSwitcher teams={teams} currentTeamId={teamId} />
        <UsageMeter />
      </CardContent>
    </Card>
  );
}
