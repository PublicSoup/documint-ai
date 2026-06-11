import { AlertCircle } from "lucide-react";

import DocEditor, { type ProjectViewMode } from "@/components/doc-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileInsightsSidebar } from "@/components/dashboard/file-insights-sidebar";
import type { DashboardDocContent, DashboardFile, DashboardSessionUser } from "@/lib/dashboard/types";

export function SelectedDocumentPanel({
  selectedFile,
  parsedDoc,
  initialView,
  currentUser,
  isPro,
  teamId,
}: {
  selectedFile: DashboardFile | null;
  parsedDoc: DashboardDocContent | null;
  initialView: ProjectViewMode;
  currentUser: DashboardSessionUser & { role: string };
  isPro: boolean;
  teamId?: string;
}) {
  if (!selectedFile || !selectedFile.documentation) {
    return (
      <DocumentUnavailableState
        title="Project file unavailable"
        message="This file is not available in the current workspace, or it does not have generated documentation yet."
      />
    );
  }

  if (!parsedDoc) {
    return (
      <DocumentUnavailableState
        title="Documentation needs regeneration"
        message="The saved documentation payload is invalid. Regenerate it to restore the editor view."
      />
    );
  }

  return (
    <div className="flex gap-4 items-start" key={selectedFile.id}>
      <div className="flex-1 h-[750px] rounded-3xl overflow-hidden glass border border-white/5 shadow-2xl relative">
        <DocEditor
          fileId={selectedFile.id}
          fileName={selectedFile.name}
          fileLanguage={selectedFile.language}
          initialContent={parsedDoc}
          initialMode={initialView}
          currentUser={currentUser}
          isPublic={selectedFile.documentation.isPublic}
          isPro={isPro}
          lockApproved={parsedDoc.lockApproved}
        />
      </div>
      <div className="w-[340px] flex-none h-[750px] rounded-3xl glass border border-white/5 shadow-2xl overflow-hidden bg-black/20">
        <FileInsightsSidebar fileId={selectedFile.id} teamId={teamId} />
      </div>
    </div>
  );
}

function DocumentUnavailableState({ title, message }: { title: string; message: string }) {
  return (
    <Card className="h-[400px] flex items-center justify-center bg-amber-500/5 border-amber-500/10">
      <div className="text-center space-y-3 p-8">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
        <h3 className="text-xl font-bold text-white">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-xs">{message}</p>
        <Button variant="outline" size="sm" className="mt-4">Regenerate documentation</Button>
      </div>
    </Card>
  );
}
