import { FolderTree } from "lucide-react";

import ChangelogGenerator from "@/components/changelog-generator";
import { DashboardFileTree } from "@/components/dashboard-file-tree";
import ReadmeGenerator from "@/components/readme-generator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardFile } from "@/lib/dashboard/types";

export function ProjectExplorerCard({
  files,
  selectedFileId,
  teamId,
}: {
  files: DashboardFile[];
  selectedFileId?: string;
  teamId?: string;
}) {
  const fileIds = files.map((file) => file.id);

  return (
    <Card className="flex min-h-[500px] flex-col overflow-hidden border-white/10 bg-[#0d0d12]/95 shadow-xl shadow-black/20" hoverEffect={false}>
      <CardHeader className="shrink-0 border-b border-white/8 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55">
              <FolderTree className="h-3.5 w-3.5" />
            </span>
            Project explorer
          </CardTitle>
          <span className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
            {files.length} files
          </span>
        </div>
        <p className="pt-2 text-xs leading-5 text-white/45">
          Navigate code surfaces and generated documentation from one inventory.
        </p>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <DashboardFileTree
          files={files}
          selectedFileId={selectedFileId}
          teamId={teamId}
        />
      </CardContent>
      {files.length > 0 && (
        <div className="shrink-0 space-y-3 border-t border-white/8 bg-black/25 p-4">
          <ReadmeGenerator fileIds={fileIds} />
          <ChangelogGenerator fileIds={fileIds} />
        </div>
      )}
    </Card>
  );
}
