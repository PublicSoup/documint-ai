import { useState } from "react";
import { useToast } from "@/components/toast";
import {
    Columns,
    Bot,
    Terminal as TerminalIcon,
    FileText,
    Layout as LayoutIcon,
    Sparkles,
    Download,
    Lock,
    Save,
    Play,
    Hammer,
    FlaskConical,
    Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { IDEFile } from "./shared/types";

interface IDEToolbarProps {
    showSidebar: boolean;
    setShowSidebar: (val: boolean) => void;
    showAIChat: boolean;
    setShowAIChat: (val: boolean) => void;
    showTerminal: boolean;
    setShowTerminal: (val: boolean) => void;
    showAIEditor: boolean;
    setShowAIEditor: (val: boolean) => void;
    showDocPreview: boolean;
    setShowDocPreview: (val: boolean) => void;
    showLocalTopology: boolean;
    setShowLocalTopology: (val: boolean) => void;
    activeFileId: string | undefined;
    activeFile: IDEFile | undefined;
    fileContents: Record<string, string>;
    replaceFileContent: (fileId: string, content: string, markUnsaved?: boolean) => void;
    unsavedChanges: Record<string, boolean>;
    handleSave: () => void;
    handleRunProject: () => void;
    handleBuildProject: () => void;
    handleTestProject: () => void;
    runStatus: string;
    isRuntimeTaskRunning?: boolean;
    setShowSecretsManager: (val: boolean) => void;
}

export function IDEToolbar({
    showSidebar, setShowSidebar,
    showAIChat, setShowAIChat,
    showTerminal, setShowTerminal,
    showAIEditor, setShowAIEditor,
    showDocPreview, setShowDocPreview,
    showLocalTopology, setShowLocalTopology,
    activeFileId, activeFile,
    fileContents, replaceFileContent,
    unsavedChanges,
    handleSave, handleRunProject, handleBuildProject, handleTestProject,
    runStatus,
    isRuntimeTaskRunning,
    setShowSecretsManager
}: IDEToolbarProps) {
    const { toast } = useToast();
    const [isAIImproving, setIsAIImproving] = useState(false);
    const activeFileContent = activeFileId ? fileContents[activeFileId] : undefined;
    const isRunInProgress = runStatus === 'installing' || runStatus === 'starting';
    const isRuntimeBusy = isRunInProgress || Boolean(isRuntimeTaskRunning);
    const canDownload = Boolean(activeFile && activeFileId && activeFileContent !== undefined);
    const canImproveCode = Boolean(activeFileId && activeFileContent?.trim()) && !isAIImproving;

    const handleAIAssistantClick = async () => {
        if (!activeFileId || activeFileContent === undefined || isAIImproving) return;
        if (!activeFileContent.trim()) {
            toast("Add code before running AI improvements", "warning");
            return;
        }

        setIsAIImproving(true);
        try {
            toast("AI is thinking...", "success");
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `Please optimize and improve this code. Return only the improved code block:\\n\\n${activeFileContent}`,
                    contextFileId: activeFileId,
                    contextContent: activeFileContent,
                    stream: false
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || "Failed to get AI improvement");
            }

            if (data.reply) {
                let improvedCode = data.reply;
                const codeBlockMatch = improvedCode.match(/```(?:[\\w]*)\\n([\\s\\S]*?)```/);
                if (codeBlockMatch) {
                    improvedCode = codeBlockMatch[1];
                }

                replaceFileContent(activeFileId, improvedCode, true);
                toast("AI improvements applied", "success");
            }
        } catch {
            toast("AI analysis failed", "error");
        } finally {
            setIsAIImproving(false);
        }
    };

    const handleDownload = () => {
        if (activeFile && activeFileId && activeFileContent !== undefined) {
            const blob = new Blob([activeFileContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = activeFile.name.split('/').pop() || 'file.txt';
            a.click();
            URL.revokeObjectURL(url);
            toast('File downloaded', 'success');
        }
    };

    const toggleBoolean = (toggleFn: (val: boolean) => void, currentValue: boolean) => {
        return (e: React.MouseEvent) => {
            e.stopPropagation();
            toggleFn(!currentValue);
        };
    };

    return (
        <div className="flex items-center gap-1 px-2 h-full bg-[#030014]">
            <button type="button" onClick={toggleBoolean(setShowSidebar, showSidebar)} className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/50 transition-all" title="Toggle Sidebar (⌘B)">
                <Columns className="w-4 h-4" />
            </button>
            <button type="button" onClick={toggleBoolean(setShowAIChat, showAIChat)} className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/50 transition-all" title="Toggle AI Chat (⌘I)">
                <Bot className="w-4 h-4" />
            </button>
            <button type="button" onClick={toggleBoolean(setShowTerminal, showTerminal)} className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/50 transition-all" title="Toggle Terminal (⌘`)">
                <TerminalIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={toggleBoolean(setShowAIEditor, showAIEditor)}
                className={cn("p-1.5 rounded transition-all", showAIEditor ? "bg-purple-500/15 text-purple-400" : "text-purple-400/40 hover:bg-purple-500/10 hover:text-purple-400")}
                title="Toggle AI Editor"
            >
                <Bot className="w-4 h-4" />
            </button>

            <button
                type="button"
                onClick={toggleBoolean(setShowDocPreview, showDocPreview)}
                className={cn("p-1.5 rounded transition-all", showDocPreview ? "bg-blue-500/15 text-blue-400" : "text-blue-400/40 hover:bg-blue-500/10 hover:text-blue-400")}
                title="Toggle Doc Preview"
            >
                <FileText className="w-4 h-4" />
            </button>

            <button
                type="button"
                onClick={toggleBoolean(setShowLocalTopology, showLocalTopology)}
                className={cn("p-1.5 rounded transition-all", showLocalTopology ? "bg-emerald-500/15 text-emerald-400" : "text-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-400")}
                title="Toggle Local Topology"
            >
                <LayoutIcon className="w-4 h-4" />
            </button>

            {showAIEditor && (
                <button
                    type="button"
                    onClick={handleAIAssistantClick}
                    disabled={!canImproveCode}
                    className="p-1.5 rounded hover:bg-amber-500/20 text-amber-500 hover:text-amber-400 disabled:opacity-30 disabled:pointer-events-none"
                    title={activeFileContent?.trim() ? "AI Code Assistant" : "Open a file with code first"}
                >
                    {isAIImproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
            )}
            
            <div className="w-px h-4 bg-white/[0.06] mx-1" />
            
            <button
                type="button"
                onClick={handleDownload}
                disabled={!canDownload}
                className="p-1.5 rounded transition-all text-white/20 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
                title="Download File"
            >
                <Download className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => setShowSecretsManager(true)}
                className="p-1.5 rounded transition-all text-amber-500/30 hover:text-amber-400 hover:bg-amber-500/10"
                title="Environment Secrets"
            >
                <Lock className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={handleSave}
                disabled={!activeFileId || !unsavedChanges[activeFileId]}
                className={cn("p-1.5 rounded transition-all flex items-center gap-1.5 text-xs font-medium", unsavedChanges[activeFileId || ""] ? "text-emerald-400 hover:bg-emerald-500/10" : "text-white/20 opacity-50")}
            >
                <Save className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={handleRunProject}
                className="p-1.5 rounded hover:bg-emerald-500/15 text-emerald-400/70 hover:text-emerald-400 disabled:opacity-30 transition-all"
                title="Run (Preview)"
                disabled={isRuntimeBusy}
            >
                {isRuntimeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            </button>
            <button
                type="button"
                onClick={handleBuildProject}
                className="p-1.5 rounded hover:bg-blue-500/15 text-blue-400/70 hover:text-blue-300 disabled:opacity-30 transition-all"
                title="Build Project"
                disabled={isRuntimeBusy}
            >
                <Hammer className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={handleTestProject}
                className="p-1.5 rounded hover:bg-violet-500/15 text-violet-400/70 hover:text-violet-300 disabled:opacity-30 transition-all"
                title="Test Project"
                disabled={isRuntimeBusy}
            >
                <FlaskConical className="w-4 h-4" />
            </button>
        </div>
    );
}
