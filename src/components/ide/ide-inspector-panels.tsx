"use client";

import dynamic from "next/dynamic";
import { FileText, Layout as LayoutIcon, Loader2, Maximize2, X } from "lucide-react";

import ReadmeGenerator from "@/components/readme-generator";
import type { ProjectGraphData } from "@/lib/graph/graph-data";
import type { IDEFile } from "./shared/types";

const GraphCanvas = dynamic(
    () => import("@/components/architecture/graph-canvas").then((mod) => mod.GraphCanvas),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center text-zinc-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </div>
        ),
    },
);

interface IDEInspectorPanelsProps {
    activeFile?: IDEFile;
    activeFileId?: string;
    files: IDEFile[];
    showDocPreview: boolean;
    showLocalTopology: boolean;
    localGraph: ProjectGraphData | null;
    onCloseDocPreview: () => void;
    onCloseLocalTopology: () => void;
    onSelectFile: (fileId: string) => void;
    onNotify: (message: string, type?: "success" | "error" | "warning") => void;
}

export function IDEInspectorPanels({
    activeFile,
    activeFileId,
    files,
    showDocPreview,
    showLocalTopology,
    localGraph,
    onCloseDocPreview,
    onCloseLocalTopology,
    onSelectFile,
    onNotify,
}: IDEInspectorPanelsProps) {
    if (!activeFile) return null;

    return (
        <>
            {showDocPreview && (
                <InspectorPanel
                    tone="blue"
                    icon={<FileText className="w-3.5 h-3.5 text-blue-300" />}
                    title="Documentation"
                    fileName={activeFile.name}
                    onClose={onCloseDocPreview}
                    action={(
                        <button
                            type="button"
                            onClick={() => {
                                const popup = window.open("", "_blank", "width=800,height=600");
                                if (!popup) return;
                                popup.document.title = `Documentation - ${activeFile.name}`;
                                popup.document.body.innerHTML = '<p style="font-family:system-ui;padding:2rem;color:#666;">Loading documentation...</p>';
                            }}
                            className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors"
                            title="Pop Out"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                >
                    <div className="p-8 prose prose-invert prose-sm max-w-none">
                        <ReadmeGenerator fileIds={activeFileId ? [activeFileId] : []} />
                    </div>
                </InspectorPanel>
            )}

            {showLocalTopology && (
                <InspectorPanel
                    tone="emerald"
                    icon={<LayoutIcon className="w-3.5 h-3.5 text-emerald-300" />}
                    title="Active Topology"
                    fileName={activeFile.name}
                    onClose={onCloseLocalTopology}
                >
                    <div className="relative flex-1 overflow-hidden">
                        {localGraph ? (
                            <GraphCanvas
                                data={localGraph}
                                variant="dependency"
                                onNodeClick={(fileId) => {
                                    const file = files.find(
                                        (candidate) => candidate.id === fileId || candidate.name === fileId,
                                    );
                                    if (!file) {
                                        onNotify(`File not found: ${fileId}`, "error");
                                        return;
                                    }
                                    onSelectFile(file.id);
                                    onNotify(`Opened ${file.name}`, "success");
                                }}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Building topology…
                            </div>
                        )}
                    </div>
                </InspectorPanel>
            )}
        </>
    );
}

interface InspectorPanelProps {
    tone: "blue" | "emerald";
    icon: React.ReactNode;
    title: string;
    fileName: string;
    action?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
}

function InspectorPanel({ tone, icon, title, fileName, action, onClose, children }: InspectorPanelProps) {
    const iconBackground = tone === "blue" ? "bg-blue-500/10" : "bg-emerald-500/10";

    return (
        <aside className="w-[40%] max-w-[800px] min-w-[350px] bg-[#040211] overflow-hidden flex flex-col animate-in slide-in-from-right duration-300 border-l border-white/[0.06] shadow-2xl z-20">
            <div className="p-3 border-b border-white/[0.08] bg-[#08051d] flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6 h-6 rounded ${iconBackground} flex items-center justify-center shrink-0`}>
                        {icon}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">{title}</h3>
                        <p className="text-[9px] text-white/35 font-mono truncate max-w-[180px]">{fileName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {action}
                    <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-red-500/10 text-white/35 hover:text-red-300 transition-colors" title="Close panel">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            {children}
        </aside>
    );
}