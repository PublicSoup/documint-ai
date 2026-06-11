import Link from "next/link";
import { BarChart3, FolderTree } from "lucide-react";

import ChangelogGenerator from "@/components/changelog-generator";
import { DashboardFileTree } from "@/components/dashboard-file-tree";
import ReadmeGenerator from "@/components/readme-generator";
import { Button } from "@/components/ui/button";
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
    <Card className="glass-card border-white/5 flex flex-col h-[500px] overflow-hidden">
      <CardHeader className="pb-2 border-b border-white/5 shrink-0">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-blue-400" />
          Project Explorer
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <DashboardFileTree files={files} selectedFileId={selectedFileId} teamId={teamId} />
      </CardContent>
      {files.length > 0 && (
        <div className="p-4 border-t border-white/5 bg-black/40 space-y-3 shrink-0">
          <ReadmeGenerator fileIds={fileIds} />
          <div className="grid grid-cols-2 gap-2">
            <ChangelogGenerator fileIds={fileIds} />
            <Link href={teamId ? `/dashboard/analytics?teamId=${teamId}` : "/dashboard/analytics"} className="w-full">
              <Button variant="ghost" size="sm" className="w-full justify-start text-[10px] h-9 hover:bg-white/5">
                <BarChart3 className="w-3 h-3 mr-2 text-purple-400" />
                Analytics
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
