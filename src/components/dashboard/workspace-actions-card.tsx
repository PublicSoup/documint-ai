import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";

import FileUpload from "@/components/file-upload";
import GitHubImport from "@/components/github-import";
import TeamSwitcher from "@/components/team-switcher";
import UsageMeter from "@/components/usage-meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PriorityAction } from "@/app/dashboard/actions";
import type { DashboardTeam } from "@/lib/dashboard/types";

export function WorkspaceActionsCard({
  teamId,
  teams,
  isPro,
  priorityActions,
}: {
  teamId?: string;
  teams: DashboardTeam[];
  isPro: boolean;
  priorityActions: PriorityAction[];
}) {
  return (
    <Card className="glass-card border-white/5 overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />
          Workspace Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0">
        <div className="grid grid-cols-1 gap-3">
          <FileUpload teamId={teamId} isPro={isPro} />
          <GitHubImport />
        </div>

        <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              Priority Queue
            </span>
            <span className="text-[10px] bg-indigo-500 text-white px-1.5 rounded-full font-bold">
              {priorityActions.length}
            </span>
          </div>
          <div className="space-y-2">
            {priorityActions.length > 0 ? priorityActions.map((action) => (
              <Link
                key={action.id}
                href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${action.fileId}`}
                className="text-[11px] text-white/60 hover:text-white transition-colors cursor-pointer flex items-center gap-2 group"
              >
                <div className={cn(
                  "w-1 h-1 rounded-full group-hover:scale-125 transition-transform",
                  action.priority === "CRITICAL" ? "bg-rose-500 animate-pulse" : "bg-amber-400",
                )} />
                <span className="truncate">{action.label}</span>
              </Link>
            )) : (
              <p className="text-[10px] text-zinc-600 italic">No critical issues detected.</p>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-2">
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Current Context</p>
          <TeamSwitcher teams={teams} currentTeamId={teamId} />
          <UsageMeter />
        </div>
      </CardContent>
    </Card>
  );
}
