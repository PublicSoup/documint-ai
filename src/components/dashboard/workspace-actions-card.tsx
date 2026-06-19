import { GitBranch, Plus, UploadCloud } from "lucide-react";

import FileUpload from "@/components/file-upload";
import GitHubImport from "@/components/github-import";
import TeamSwitcher from "@/components/team-switcher";
import UsageMeter from "@/components/usage-meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardTeam } from "@/lib/dashboard/types";

export function WorkspaceActionsCard({
  teamId,
  teams,
  isPro,
}: {
  teamId?: string;
  teams: DashboardTeam[];
  isPro: boolean;
}) {
  return (
    <Card className="overflow-hidden border-white/10 bg-[#0d0d12]/95 shadow-xl shadow-black/20" hoverEffect={false}>
      <CardHeader className="border-b border-white/8 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Plus className="h-3.5 w-3.5" />
            </span>
            Add to workspace
          </CardTitle>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            Ready
          </span>
        </div>
        <p className="pt-2 text-xs leading-5 text-white/45">
          Import source code, sync repositories, and keep the operational scope aligned.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
              <UploadCloud className="h-3.5 w-3.5 text-primary" />
              Direct upload
            </div>
            <FileUpload teamId={teamId} isPro={isPro} />
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
              <GitBranch className="h-3.5 w-3.5 text-primary" />
              Repository sync
            </div>
            <GitHubImport />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-white/8 bg-black/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Current context
          </p>
          <TeamSwitcher teams={teams} currentTeamId={teamId} />
          <UsageMeter />
        </div>
      </CardContent>
    </Card>
  );
}
