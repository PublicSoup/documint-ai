import dynamic from "next/dynamic";
import { X, Workflow, Loader2, Sparkles } from "lucide-react";

const DiagramViewer = dynamic(() => import("@/components/diagram-viewer").then(mod => mod.DiagramViewer), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center p-8 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading Diagram Engine...
        </div>
    )
});

interface DiagramModalProps {
    isOpen: boolean;
    onClose: () => void;
    diagramType: string;
    setDiagramType: (val: string) => void;
    generatingDiagram: boolean;
    onGenerate: () => void;
    diagramCode: string;
}

export function DiagramModal({
    isOpen,
    onClose,
    diagramType,
    setDiagramType,
    generatingDiagram,
    onGenerate,
    diagramCode
}: DiagramModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col text-white border border-white/10">
                <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                        <Workflow className="w-5 h-5 text-pink-500" />
                        Architecture Diagram
                    </h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    <div className="flex gap-4 items-center">
                        <select
                            value={diagramType}
                            onChange={(e) => setDiagramType(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                        >
                            <option value="class">Class Diagram</option>
                            <option value="sequence">Sequence Diagram</option>
                            <option value="flowchart">Flowchart</option>
                            <option value="state">State Diagram</option>
                        </select>

                        <button
                            onClick={onGenerate}
                            disabled={generatingDiagram}
                            className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                        >
                            {generatingDiagram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Generate Diagram
                        </button>
                    </div>

                    <div className="min-h-[400px] border border-zinc-800 rounded-xl bg-zinc-950/50 relative overflow-hidden">
                        {diagramCode ? (
                            <div className="p-4 h-full">
                                <DiagramViewer code={diagramCode} type={diagramType} />
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
                                <Workflow className="w-12 h-12 mb-4 opacity-20" />
                                {generatingDiagram ? (
                                    <div className="space-y-2">
                                        <p className="text-lg font-medium text-pink-500 animate-pulse">Analyzing code structure...</p>
                                        <p className="text-sm">Generating {diagramType} diagram...</p>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-lg font-medium mb-2 text-zinc-300">Ready to Visualize</p>
                                        <p className="text-sm max-w-md text-zinc-500">
                                            Select a diagram type and click Generate to visualize your code's structure, flow, or relationships using AI.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
