"use client";

import { WebContainerManager } from "@/lib/web-container";
import { FileTreeContainer } from "./file-tree-container";
import ErrorBoundary from "@/components/error-boundary";
import { SimpleEnhancedEditor, SimpleEnhancedEditorRef } from "./simple-enhanced-editor";
import DynamicDiagramViewer from "../dynamic-diagram-viewer";

import React, { useState, useEffect, useRef, useCallback } from "react";

import type { Monaco } from "@monaco-editor/react";
import { Breadcrumbs } from "./breadcrumbs";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { LivePreview } from "./live-preview";
import { ProjectTemplates } from "./project-templates";
import NotificationsBell from "../notifications-bell";
import { X, Save, Play, Bot, Layout, Maximize2, Columns, Terminal as TerminalIcon, Settings, Sparkles, GitBranch, Files, Search as SearchIcon, Globe, Loader2, Lock, FileText, Share2, Wand2, Zap, Layout as LayoutIcon, SplitSquareVertical, ChevronUp, ChevronDown, Trash2, SplitSquareHorizontal, Download, Keyboard } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { File } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "../toast";
import { Button } from "../ui/button";
import { AIChatPanel } from "./ai-chat-panel";

import { WebContainerTerminal as Terminal } from './webcontainer-terminal';
import { useExecutionEngine } from "@/hooks/use-execution-engine";
import { RunnerConfigDialog } from "./runner-config-dialog";
import { ActivityBar } from "./activity-bar";
import { Sidebar } from "./sidebar";
import { EditorTabs } from "./editor-tabs";
import { SecretsManager } from "./secrets-manager";
import { IDEStatusBar } from "./status-bar";
import ReadmeGenerator from "../readme-generator";
import { ContextualHeader } from "./contextual-header";
import { getProjectGraphMermaid } from "@/app/dashboard/client-actions";
import { CommandPalette } from "./command-palette";
import { SourceControlPanel } from "./source-control-panel";
import { DiffModal } from "./diff-modal";
import { useIDESettings } from "@/hooks/use-ide-settings";
import { loadTypesFromWebContainer } from "@/lib/monaco-type-loader";
import { useIDEFileManager } from "@/hooks/use-ide-file-manager";
import { useIDEHotkeys } from "@/hooks/use-ide-hotkeys";
import { IDEToolbar } from "./ide-toolbar";
import { TerminalPanel } from "./terminal-panel";
// Auto-detect Monaco language from file name
function getLanguageFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact',
        js: 'javascript', jsx: 'javascriptreact', mjs: 'javascript', cjs: 'javascript',
        css: 'css', scss: 'scss', less: 'less',
        html: 'html', htm: 'html',
        json: 'json', jsonc: 'json',
        md: 'markdown', mdx: 'markdown',
        py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
        c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
        cs: 'csharp', php: 'php', sql: 'sql',
        sh: 'shell', bash: 'shell', zsh: 'shell',
        yaml: 'yaml', yml: 'yaml',
        xml: 'xml', svg: 'xml',
        graphql: 'graphql', gql: 'graphql',
        dockerfile: 'dockerfile',
        toml: 'ini', ini: 'ini',
        env: 'plaintext', txt: 'plaintext', log: 'plaintext',
    };
    return map[ext || ''] || 'plaintext';
}



interface SubscriptionUsage {
    tokens?: number;
}

interface SubscriptionLimits {
    totalFiles?: number;
    maxTokens?: number;
}

interface SubscriptionInfo {
    plan?: string;
    usage?: SubscriptionUsage;
    limits?: SubscriptionLimits;
}

interface IDEUser {
    id: string;
    name?: string | null;
    email?: string | null;
}

interface EnhancedIDELayoutProps {
    files: (File & { content?: string | null })[];
    user: IDEUser;
    subscription?: SubscriptionInfo;
}

export default function EnhancedIDELayout({ files: initialFiles, user, subscription }: EnhancedIDELayoutProps) {
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const {
        files,
        activeFileId,
        openFiles,
        fileContents,
        unsavedChanges,
        isSaving,
        upsertFile,
        renameFile,
        removeFile,
        replaceFileContent,
        setFileUnsavedState,
        handleFileSelect,
        handleCloseFile,
        handleContentChange,
        handleSave
    } = useIDEFileManager(initialFiles);
    const [terminalInstance, setTerminalInstance] = useState<any>(null);

    // Unify WebContainer logic via hook
    const {
        runStatus,
        webContainerBooted,
        previewUrl,
        isPreviewOpen,
        setIsPreviewOpen,
        run: runProject,
        mountAll: mountAllFiles
    } = useExecutionEngine({
        files,
        activeFileId,
        fileContents,
        terminalInstance
    });

    // Diff Modal State
    const [diffModalOpen, setDiffModalOpen] = useState(false);
    const [diffContent, setDiffContent] = useState({ original: "", modified: "", language: "typescript" });

    // Layout State (synced)
    const { settings, updateSetting, loading: settingsLoading } = useIDESettings();
    const showSidebar = settings.showSidebar;
    const setShowSidebar = (val: boolean) => updateSetting("showSidebar", val);

    const activeSidebarTab = settings.activeSidebarTab;
    const setActiveSidebarTab = (val: "explorer" | "search" | "git") => updateSetting("activeSidebarTab", val);

    const showAIChat = settings.showAIChat;
    const setShowAIChat = (val: boolean) => updateSetting("showAIChat", val);

    const showAIEditor = settings.showAIEditor;
    const setShowAIEditor = (val: boolean) => updateSetting("showAIEditor", val);

    const showTerminal = settings.showTerminal;
    const setShowTerminal = (val: boolean) => updateSetting("showTerminal", val);

    const showDocPreview = settings.showDocPreview;
    const setShowDocPreview = (val: boolean) => updateSetting("showDocPreview", val);

    const showLocalTopology = settings.showLocalTopology;
    const setShowLocalTopology = (val: boolean) => updateSetting("showLocalTopology", val);

    const [localMermaid, setLocalMermaid] = useState<string>("");
    const editorRef = useRef<SimpleEnhancedEditorRef>(null);
    const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorColumn, setCursorColumn] = useState(1);
    const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
    const [terminalMaximized, setTerminalMaximized] = useState(false);
    const [typesLoaded, setTypesLoaded] = useState(false);

    const monacoInstanceRef = useRef<Monaco | null>(null);
    const [showSecretsManager, setShowSecretsManager] = useState(false);
    const [envSecrets, setEnvSecrets] = useState<{ key: string; value: string }[]>([]);

    // Handle query parameter for auto-opening files
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setShowSidebar(false);
        }
    }, [setShowSidebar]);

    useEffect(() => {
        const fileToOpen = searchParams.get('file');
        if (fileToOpen) {
            // Check dynamic files list, not just initial
            const file = files.find(f => f.id === fileToOpen || f.name === fileToOpen);
            if (file) {
                handleFileSelect(file.id);
                toast(`Opened ${file.name} from Architecture Map`, "success");
            }
        }
    }, [searchParams, files]); // Added files dependency

    // Fetch local topology for active file
    useEffect(() => {
        if (showLocalTopology) {
            getProjectGraphMermaid().then((code: string | null) => {
                setLocalMermaid(code || "");
            });
        }
    }, [showLocalTopology, activeFileId]);

    const handleReviewDiff = useCallback((original: string, modified: string) => {
        // Find language for active file
        const file = files.find(f => f.id === activeFileId);
        const language = file ? file.language : "typescript";

        setDiffContent({
            original,
            modified,
            language
        });
        setDiffModalOpen(true);
    }, [activeFileId, files]);



    const handleRunProject = async () => {
        if (!webContainerBooted) {
            toast("runtime not ready", "error");
            return;
        }

        setShowTerminal(true);
        setIsPreviewOpen(true);

        try {
            await runProject();

            // Still handle type loading here or in hook? 
            // Better to keep UI-specific things like type loading in the layout if it uses Monaco ref.
            const wc = await WebContainerManager.getInstance();
            if (monacoInstanceRef.current) {
                try {
                    const count = await loadTypesFromWebContainer(wc, monacoInstanceRef.current);
                    if (count > 0) {
                        toast(`Loaded ${count} type definitions`, "success");
                    }
                } catch (e) {
                    console.warn("Type loading failed:", e);
                }
            }
        } catch (e) {
            toast(`Failed to run: ${e}`, "error");
        }
    };



    



    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

    // Hotkeys
    useIDEHotkeys({
        onSave: handleSave,
        onToggleSidebar: () => setShowSidebar(!showSidebar),
        onCommandPalette: () => setIsCommandPaletteOpen(true),
        onToggleAIChat: () => setShowAIChat(!showAIChat),
        onToggleTerminal: () => setShowTerminal(!showTerminal)
    }, [activeFileId, fileContents, unsavedChanges, showSidebar, showAIChat, showTerminal]);

    const activeFile = files.find(f => f.id === activeFileId);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#030014] text-white fixed inset-0 z-[100] selection:bg-purple-500/30">
            {/* Activity Bar */}
            {/* Activity Bar — Premium with gradient and glow */}
            <div className="w-12 flex-none flex flex-col items-center py-3 gap-1 border-r border-white/[0.04] bg-gradient-to-b from-[#04001a] via-[#06001f] to-[#04001a] z-40 h-full overflow-hidden">
                {/* Brand Mark */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/20 to-violet-500/10 flex items-center justify-center mb-3 border border-purple-500/10">
                    <Sparkles className="w-4 h-4 text-purple-400/70" />
                </div>

                <button
                    onClick={() => {
                        if (activeSidebarTab === "explorer" && showSidebar) {
                            setShowSidebar(false);
                        } else {
                            setActiveSidebarTab("explorer");
                            setShowSidebar(true);
                        }
                    }}
                    className={cn(
                        "p-2 rounded-lg transition-all duration-200 relative group",
                        showSidebar && activeSidebarTab === "explorer"
                            ? "bg-purple-500/15 text-purple-400"
                            : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"
                    )}
                    title="Explorer (⌘B)"
                >
                    {showSidebar && activeSidebarTab === "explorer" && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-purple-400 rounded-r" />}
                    <Files className="w-5 h-5" />
                </button>
                <button
                    onClick={() => {
                        if (activeSidebarTab === "search" && showSidebar) {
                            setShowSidebar(false);
                        } else {
                            setActiveSidebarTab("search");
                            setShowSidebar(true);
                        }
                    }}
                    className={cn(
                        "p-2 rounded-lg transition-all duration-200 relative group",
                        showSidebar && activeSidebarTab === "search"
                            ? "bg-purple-500/15 text-purple-400"
                            : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"
                    )}
                    title="Search (⌘F)"
                >
                    {showSidebar && activeSidebarTab === "search" && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-purple-400 rounded-r" />}
                    <SearchIcon className="w-5 h-5" />
                </button>
                <button
                    onClick={() => {
                        if (activeSidebarTab === "git" && showSidebar) {
                            setShowSidebar(false);
                        } else {
                            setActiveSidebarTab("git");
                            setShowSidebar(true);
                        }
                    }}
                    className={cn(
                        "p-2 rounded-lg transition-all duration-200 relative group",
                        showSidebar && activeSidebarTab === "git"
                            ? "bg-purple-500/15 text-purple-400"
                            : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"
                    )}
                    title="Source Control (⌘G)"
                >
                    {showSidebar && activeSidebarTab === "git" && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-purple-400 rounded-r" />}
                    <GitBranch className="w-5 h-5" />
                </button>

                <div className="flex-1" />

                <div className="flex flex-col gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowTerminal(!showTerminal);
                        }}
                        className={cn(
                            "p-2 rounded-lg transition-all duration-200",
                            showTerminal
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"
                        )}
                        title="Terminal (⌘`)">
                        <TerminalIcon className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setShowKeyboardShortcuts(true)}
                        className="p-2 text-white/25 hover:text-white/50 hover:bg-white/[0.04] rounded-lg transition-all duration-200"
                        title="Keyboard Shortcuts"
                    >
                        <Keyboard className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Left Sidebar Content */}
            {showSidebar && (
                <>
                    {/* Mobile Backdrop */}
                    <div
                        className="md:hidden fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowSidebar(false)}
                    />
                    <div className="absolute md:relative w-56 md:w-64 flex-none flex flex-col border-r border-white/[0.04] bg-[#030014] h-full overflow-hidden animate-in slide-in-from-left-1 duration-200 z-30 shadow-2xl md:shadow-none">
                        {activeSidebarTab === "explorer" && (
                            <FileTreeContainer
                                activeFileId={activeFileId}
                                onSelect={handleFileSelect}
                                onFileCreated={(newFile) => {
                                    upsertFile(newFile, {
                                        open: true,
                                        makeActive: true,
                                        initialContent: newFile.content || "",
                                    });
                                }}
                                onFileRenamed={(fileId, newName) => {
                                    renameFile(fileId, newName);
                                }}
                                onFileDeleted={(fileId) => {
                                    removeFile(fileId);
                                }}
                            />
                        )}
                        {activeSidebarTab === "search" && (
                            <div className="flex flex-col h-full">
                                <div className="p-4 border-b border-white/[0.04]">
                                    <h2 className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">Search</h2>
                                    <div className="relative">
                                        <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                        <input
                                            placeholder="Search in project..."
                                            className="w-full bg-black/20 border border-white/[0.06] rounded-md pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/30 transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 flex items-center justify-center p-4 text-center">
                                    <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">Search results will appear here</p>
                                </div>
                            </div>
                        )}
                        {activeSidebarTab === "git" && (
                            <SourceControlPanel />
                        )}
                    </div>
                </>
            )}

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 max-w-full bg-[#030014] relative z-10 h-full overflow-hidden">
                {/* Enterprise Header */}
                <ContextualHeader
                    filePath={activeFile?.name || "No file selected"}
                    isSaving={isSaving}
                    isDeploying={runStatus === 'installing' || runStatus === 'starting'}
                    onDeploy={handleRunProject}
                    onShare={async () => {
                        if (activeFile) {
                            await navigator.clipboard.writeText(window.location.href + '?file=' + activeFile.id);
                            toast('Share link copied to clipboard!', 'success');
                        }
                    }}
                    onSettings={() => setShowKeyboardShortcuts(true)}
                />
                {/* Notification Bell - top right */}
                <div className="absolute top-2 right-4 z-50">
                    <NotificationsBell />
                </div>

                {/* Tabs & Toolbar */}
                <div className="flex-none flex items-center justify-between h-10 bg-[#030014] border-b border-white/[0.04] select-none overflow-hidden">
                    <div className="flex items-center h-full overflow-x-auto custom-scrollbar">
                        {openFiles.map(fileId => {
                            // Use dynamic state to find file
                            const file = files.find(f => f.id === fileId);
                            if (!file) return null;
                            const isActive = fileId === activeFileId;
                            const isUnsaved = unsavedChanges[fileId];

                            return (
                                <div
                                    key={fileId}
                                    onClick={() => handleFileSelect(fileId)}
                                    className={cn(
                                        "h-full px-3 flex items-center gap-2 text-xs border-r border-white/[0.04] cursor-pointer transition-all duration-200 min-w-[100px] max-w-[200px] group relative",
                                        isActive ? "bg-[#030014] text-white" : "bg-[#020010] text-white/40 hover:bg-[#030014]/80 hover:text-white/60"
                                    )}
                                >
                                    {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 to-violet-400" />}
                                    <span className="truncate">{file.name}</span>
                                    {isUnsaved && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />}
                                    <button
                                        onClick={(e) => handleCloseFile(e, fileId)}
                                        className={cn("opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-white/10", isActive && "opacity-100")}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <IDEToolbar
                        showSidebar={showSidebar} setShowSidebar={setShowSidebar}
                        showAIChat={showAIChat} setShowAIChat={setShowAIChat}
                        showTerminal={showTerminal} setShowTerminal={setShowTerminal}
                        showAIEditor={showAIEditor} setShowAIEditor={setShowAIEditor}
                        showDocPreview={showDocPreview} setShowDocPreview={setShowDocPreview}
                        showLocalTopology={showLocalTopology} setShowLocalTopology={setShowLocalTopology}
                        activeFileId={activeFileId} activeFile={activeFile}
                        fileContents={fileContents} replaceFileContent={replaceFileContent}
                        unsavedChanges={unsavedChanges}
                        handleSave={handleSave} handleRunProject={handleRunProject}
                        runStatus={runStatus} webContainerBooted={webContainerBooted}
                        setShowSecretsManager={setShowSecretsManager}
                    />
                </div>

                {/* Editor Area */}
                <div className="flex-1 relative min-h-0 overflow-hidden flex">
                    <div className={cn("flex-1 min-w-0 relative h-full transition-all duration-300 ease-in-out", (showDocPreview || showLocalTopology) && "border-r border-white/[0.06]")}>
                        {/* Editor content area - no overlaying HUD */}

                        {activeFileId && activeFile ? (
                            fileContents[activeFileId] === undefined ? (
                                <div className="h-full flex items-center justify-center bg-[#0d0d11]">
                                    <Loader2 className="w-6 h-6 animate-spin text-purple-500/50" />
                                </div>
                            ) : (
                                <div className="flex flex-col h-full">
                                    <Breadcrumbs filePath={activeFile.name} />
                                    <div className="flex-1 min-h-0">
                                        <ErrorBoundary>
                                            <SimpleEnhancedEditor
                                                key={activeFileId} // Force remount on file change
                                                ref={editorRef}
                                                code={fileContents[activeFileId] ?? ""}
                                                language={getLanguageFromFileName(activeFile.name)}
                                                fileName={activeFile.name}
                                                onChange={handleContentChange}
                                                onSave={handleSave}
                                                onRun={handleRunProject}
                                                onMonacoMount={(monaco) => {
                                                    monacoInstanceRef.current = monaco;
                                                }}
                                                onCursorChange={(line, col) => {
                                                    setCursorLine(line);
                                                    setCursorColumn(col);
                                                }}
                                            />
                                        </ErrorBoundary>
                                    </div>
                                </div>
                            )
                        ) : (
                            /* Empty State: Show Project Templates when no file is open */
                            <ProjectTemplates
                                onSelectTemplate={async (templateFiles) => {
                                    try {
                                        // Use the new bulk-create API for efficiency
                                        const res = await fetch("/api/files/bulk-create", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ files: templateFiles })
                                        });

                                        if (res.ok) {
                                            const data = await res.json();
                                            const createdFiles = data.files;

                                            // Update state with all new files
                                            createdFiles.forEach((createdFile: File & { content?: string | null }) => {
                                                upsertFile(createdFile, {
                                                    initialContent: createdFile.content || "",
                                                });
                                            });

                                            // Auto-open the first file if available
                                            if (createdFiles.length > 0) {
                                                upsertFile(createdFiles[0], {
                                                    open: true,
                                                    makeActive: true,
                                                    initialContent: createdFiles[0].content || "",
                                                });
                                            }

                                            toast(`Created ${createdFiles.length} files from template`, "success");

                                            // Synchronize all new files to WebContainer immediately
                                            if (webContainerBooted) {
                                                await mountAllFiles([...files, ...createdFiles]);
                                            }
                                        } else {
                                            const errorData = await res.json();
                                            toast(errorData.error || "Failed to create template files", "error");
                                        }
                                    } catch (e) {
                                        console.error("Failed to batch create template files:", e);
                                        toast("Error initializing template", "error");
                                    }
                                }}
                            />
                        )}
                    </div>

                    {showDocPreview && activeFile && (
                        <div className="w-[40%] max-w-[800px] min-w-[350px] bg-[#020010] overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-500 border-l border-white/5 shadow-2xl z-20">
                            <div className="p-3 border-b border-white/10 bg-[#08002a] flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">Documentation</h3>
                                        <p className="text-[9px] text-white/30 font-mono truncate max-w-[150px]">{activeFile.name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            // Open doc preview in a new window
                                            const w = window.open('', '_blank', 'width=800,height=600');
                                            if (w && activeFile) {
                                                w.document.title = `Documentation - ${activeFile.name}`;
                                                w.document.body.innerHTML = '<p style="font-family:system-ui;padding:2rem;color:#666;">Loading documentation...</p>';
                                            }
                                        }}
                                        className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/60 transition-colors"
                                        title="Pop Out"
                                    >
                                        <Maximize2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setShowDocPreview(false)} className="p-1.5 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-8 prose prose-invert prose-sm max-w-none">
                                <ReadmeGenerator
                                    fileIds={activeFileId ? [activeFileId] : []}
                                />
                            </div>
                        </div>
                    )}

                    {showLocalTopology && activeFile && (
                        <div className="w-[40%] max-w-[800px] min-w-[350px] bg-[#020010] overflow-hidden flex flex-col animate-in slide-in-from-right duration-500 border-l border-white/5 shadow-2xl z-20">
                            <div className="p-3 border-b border-white/10 bg-[#08002a] flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
                                        <LayoutIcon className="w-3.5 h-3.5 text-emerald-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">Active Topology</h3>
                                        <p className="text-[9px] text-white/30 font-mono truncate max-w-[150px]">{activeFile.name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setShowLocalTopology(false)} className="p-1.5 rounded hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 p-4 overflow-hidden relative">
                                <DynamicDiagramViewer code={localMermaid} type="flowchart" onNodeClick={(filePath) => {
                                    // Resolve file path to database ID
                                    const file = files.find(f => f.name === filePath || f.id === filePath || f.name.endsWith(filePath));
                                    if (file) {
                                        handleFileSelect(file.id);
                                        toast(`Opened ${file.name}`, "success");
                                    } else {
                                        toast(`File not found: ${filePath}`, "error");
                                    }
                                }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Bar */}
                <IDEStatusBar
                    fileCount={files.length}
                    maxFiles={subscription?.limits?.totalFiles || 25}
                    tokensUsed={subscription?.usage?.tokens || 0}
                    maxTokens={subscription?.limits?.maxTokens || 10000}
                    plan={subscription?.plan || "Free"}
                    isSaving={isSaving}
                    activeFile={activeFile?.name}
                    cursorLine={cursorLine}
                    cursorColumn={cursorColumn}
                />



                {/* Terminal Panel (Enterprise) */}
                {showTerminal && (
                    <TerminalPanel
                        terminalMaximized={terminalMaximized}
                        setTerminalMaximized={setTerminalMaximized}
                        setShowTerminal={setShowTerminal}
                        setTerminalInstance={setTerminalInstance}
                    />
                )}
            </div>

            {/* Live Preview Panel — powered by WebContainer dev server */}
            {isPreviewOpen && (
                <div className="w-[400px] flex-none h-full min-h-0 z-40">
                    <LivePreview
                        url={previewUrl || undefined}
                        runStatus={runStatus}
                        onClose={() => setIsPreviewOpen(false)}
                        onRun={handleRunProject}
                    />
                </div>
            )}

            {/* Right Sidebar (AI) */}
            {showAIChat && (
                <div className="w-[300px] md:w-[350px] flex-none border-l border-white/[0.04] bg-[#020010] flex flex-col h-full min-h-0 overflow-hidden z-30 relative">
                    <AIChatPanel
                        activeFileId={activeFileId}
                        activeFileContent={activeFileId ? fileContents[activeFileId] : undefined}
                        activeFileName={activeFile ? activeFile.name : undefined}
                        allFiles={files.map(f => ({ id: f.id, name: f.name, language: f.language }))}
                        allFileContents={fileContents}
                        onInsertCode={(code) => {
                            if (activeFileId) {
                                replaceFileContent(activeFileId, code, true);
                                toast("Code applied to file", "success");
                            }
                        }}
                        onInsertCodeAtCursor={(code) => {
                            if (editorRef.current) {
                                editorRef.current.insertCodeAtCursor(code);
                                if (activeFileId) {
                                    setFileUnsavedState(activeFileId, true);
                                }
                                toast("Code inserted at cursor", "success");
                            }
                        }}
                        onReplaceFileContent={(code, markUnsaved = true) => {
                            if (activeFileId && editorRef.current) {
                                // Use editor method to preserve undo stack
                                editorRef.current.replaceContent(code);

                                // State update will happen via onChange callback from editor
                                if (!markUnsaved) {
                                    setFileUnsavedState(activeFileId, false);
                                }
                                toast("Code applied successfully", "success");
                            } else if (activeFileId) {
                                // Fallback if editor ref not available (e.g. not focused)
                                replaceFileContent(activeFileId, code, markUnsaved);
                                toast("Code applied (undo stack reset)");
                            }
                        }}
                        onCreateFile={async (name, content) => {
                            try {
                                const res = await fetch("/api/files/create", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name, content, type: "file" })
                                });

                                if (res.ok) {
                                    const newFile = await res.json();
                                    toast(`File ${name} created`, "success");

                                    // Dynamic state update without reload
                                    upsertFile(newFile, {
                                        open: true,
                                        makeActive: true,
                                        initialContent: content || "",
                                    });
                                } else {
                                    toast("Failed to create file", "error");
                                }
                            } catch (e) {
                                toast("Error creating file", "error");
                            }
                        }}
                        onSelectFile={handleFileSelect}
                        onReviewDiff={handleReviewDiff}
                    />
                </div>
            )}

            <DiffModal
                open={diffModalOpen}
                onOpenChange={setDiffModalOpen}
                original={diffContent.original}
                modified={diffContent.modified}
                language={diffContent.language}
                fileName={activeFile?.name}
                onApply={() => {
                    setDiffModalOpen(false);
                    toast("Please click 'Apply' in the chat to confirm changes.");
                }}
            />

            <CommandPalette 
                isOpen={isCommandPaletteOpen} 
                onClose={() => setIsCommandPaletteOpen(false)} 
                files={files}
                onSelectFile={handleFileSelect}
                onRunCommand={(cmdId) => {
                    // Handle command execution
                    switch(cmdId) {
                        case 'toggle-terminal': setShowTerminal(!showTerminal); break;
                        case 'toggle-sidebar': setShowSidebar(!showSidebar); break;
                        case 'toggle-minimap': break;
                        case 'format-document': break;
                        case 'go-to-settings': setShowKeyboardShortcuts(true); break;
                        case 'toggle-wordwrap': break;
                        case 'keyboard-shortcuts': setShowKeyboardShortcuts(true); break;
                    }
                }}
            />
            <KeyboardShortcuts isOpen={showKeyboardShortcuts} onClose={() => setShowKeyboardShortcuts(false)} />
            <SecretsManager
                open={showSecretsManager}
                onOpenChange={setShowSecretsManager}
                secrets={envSecrets}
                onSave={(secrets) => {
                    setEnvSecrets(secrets);
                    toast(`Saved ${secrets.length} environment secret${secrets.length !== 1 ? 's' : ''}`, 'success');
                }}
            />
        </div>
    );
}
