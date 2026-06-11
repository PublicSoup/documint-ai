import { Suspense } from "react";
import Link from "next/link";
import { Activity, BarChart3, Check, ShieldCheck, Terminal } from "lucide-react";

import type { Hotspot, PriorityAction } from "@/app/dashboard/actions";
import { TeamProjectOverview } from "@/components/analytics/team-overview";
import { CodebasesView } from "@/components/codebases/codebases-view";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";
import { CommandCenter } from "@/components/dashboard/command-center";
import { CommandCenterSkeleton } from "@/components/dashboard/command-center-skeleton";
import { ProjectExplorerCard } from "@/components/dashboard/project-explorer-card";
import { SelectedDocumentPanel } from "@/components/dashboard/selected-document-panel";
import { WorkspaceActionsCard } from "@/components/dashboard/workspace-actions-card";
import { Card, CardTitle } from "@/components/ui/card";
import type { DashboardDocContent, DashboardFile, DashboardSessionUser, DashboardTeam, ProjectViewMode } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

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
}: DashboardOverviewTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500">
      <TeamProjectOverview teamId={teamId} />
      <QuickLaunch />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside className="lg:col-span-4 space-y-6">
          <WorkspaceActionsCard teamId={teamId} teams={teams} isPro={isPro} priorityActions={priorityActions} />
          <ProjectExplorerCard files={files} selectedFileId={selectedDocId} teamId={teamId} />
        </aside>

        <section className="lg:col-span-8 flex flex-col gap-6">
          {codebasesViewEnabled ? (
            <CodebasesView teamId={teamId ?? null} />
          ) : files.length === 0 ? (
            <DashboardEmptyState teamId={teamId} isPro={isPro} />
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
              />
            </Suspense>
          )}

          {!selectedDocId && !codebasesViewEnabled && files.length > 0 && (
            <SecondaryInsights teamId={teamId} hotspots={hotspots} totalFilesCount={totalFilesCount} verifiedDocsCount={verifiedDocsCount} />
          )}
        </section>
      </div>
    </div>
  );
}

function QuickLaunch() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <Card className="lg:col-span-4 bg-primary/10 border-primary/20 relative overflow-hidden group cursor-pointer hover:bg-primary/20 transition-all shadow-2xl shadow-primary/10">
        <Link href="/code" className="absolute inset-0 z-10" aria-label="Open Cloud Web IDE" />
        <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-primary/30 blur-3xl rounded-full group-hover:scale-150 transition-transform duration-700" />
        <div className="p-6 flex flex-col justify-between h-full min-h-40 relative z-20">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg">
              <Terminal className="w-6 h-6" />
            </div>
            <div className="px-2 py-1 rounded bg-primary/20 text-[10px] font-bold text-primary tracking-widest uppercase">PRO FEATURE</div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Cloud Web IDE</h3>
            <p className="text-xs text-white/60">Launch your intelligent development environment instantly.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SecondaryInsights({
  teamId,
  hotspots,
  totalFilesCount,
  verifiedDocsCount,
}: {
  teamId?: string;
  hotspots: Hotspot[];
  totalFilesCount: number;
  verifiedDocsCount: number;
}) {
  const analyticsHref = teamId ? `/dashboard/analytics?teamId=${teamId}` : "/dashboard/analytics";
  const coverage = totalFilesCount > 0 ? (verifiedDocsCount / totalFilesCount) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="glass-card border-white/5 p-6">
        <div className="flex items-center justify-between mb-6">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Documentation Health
          </CardTitle>
          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Live</span>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black text-white">{totalFilesCount}</div>
            <div>
              <div className="text-xs text-white/50">Total Files</div>
              <div className="text-xs text-white/30">{verifiedDocsCount} documented</div>
            </div>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${coverage}%` }} />
          </div>
          <Link href={analyticsHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-[10px] font-bold text-white/40 hover:bg-white/10 hover:text-white/60 transition-colors">
            <BarChart3 className="w-3 h-3" />
            View Analytics
          </Link>
        </div>
      </Card>

      <Card className="glass-card border-white/5 p-6">
        <div className="flex items-center justify-between mb-6">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-400" />
            Hotspot Analysis
          </CardTitle>
          <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">Live</span>
        </div>
        <div className="space-y-3">
          {hotspots.length > 0 ? hotspots.slice(0, 5).map((file) => (
            <Link
              key={file.id}
              href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${file.id}`}
              className="flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  file.riskScore > 70 ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : file.riskScore > 40 ? "bg-amber-400" : "bg-emerald-400",
                )} />
                <span className="text-sm text-white/70 group-hover:text-white transition-colors truncate max-w-[180px]">{file.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={cn(
                  "px-1.5 py-0.5 rounded text-[8px] font-black uppercase",
                  file.isDocumented ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500",
                )}>
                  {file.isDocumented ? "Docs" : "Missing"}
                </div>
                <span className="text-[10px] font-bold text-zinc-500">{file.riskScore}</span>
              </div>
            </Link>
          )) : (
            <div className="flex items-center gap-2 text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span className="text-xs font-bold">No hotspots detected</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
