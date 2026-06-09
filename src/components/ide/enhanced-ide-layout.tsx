"use client";

import { WebContainerManager } from "@/lib/web-container";
import { FileTreeContainer } from "./file-tree-container";
import ErrorBoundary from "@/components/error-boundary";
import { SimpleEnhancedEditor, SimpleEnhancedEditorRef } from "./simple-enhanced-editor";
import { DiagramViewer } from "../diagram-viewer";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

import type { Monaco } from "@monaco-editor/react";
import type { Terminal as XTerm } from "@xterm/xterm";
import { Breadcrumbs } from "./breadcrumbs";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { LivePreview } from "./live-preview";
import { ProjectTemplates } from "./project-templates";
import NotificationsBell from "../notifications-bell";
import { X, Maximize2, Terminal as TerminalIcon, Sparkles, GitBranch, Files, Search as SearchIcon, Loader2, FileText, Layout as LayoutIcon, Keyboard, FolderOpen } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "../toast";
import { AIChatPanel } from "./ai-chat-panel";

import { useExecutionEngine } from "@/hooks/use-execution-engine";
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
import { DeleteProjectDialog } from "./delete-project-dialog";
import type { IDEFile, IDEUser, SidebarTab, SubscriptionInfo } from "./shared/types";
import { extractTopLevelFolders, filterFilesByWorkspace, getLanguageFromFileName, getResponseErrorMessage, slugifyProjectName } from "./shared/ide-constants";

interface EnhancedIDELayoutProps {
    files: IDEFile[];
    user: IDEUser;
    subscription?: SubscriptionInfo;
}

export default function EnhancedIDELayout({ files: initialFiles, subscription }: EnhancedIDELayoutProps) {
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
        removeFiles,
        replaceFileContent,
        setFileUnsavedState,
        handleFileSelect,
        handleCloseFile,
        handleContentChange,
        handleSave
    } = useIDEFileManager(initialFiles);
    const [terminalInstance, setTerminalInstance] = useState<XTerm | null>(null);
    const [envSecrets, setEnvSecrets] = useState<{ key: string; value: string }[]>([]);
    const [activeWorkspace, setActiveWorkspace] = useState("Project");
    const workspaceOptions = useMemo(() => {
        return ["Project", ...extractTopLevelFolders(files)];
    }, [files]);
    const visibleFiles = useMemo(() => {
        return filterFilesByWorkspace(files, activeWorkspace);
    }, [activeWorkspace, files]);

    // Unify WebContainer logic via hook
    const {
        runStatus,
        webContainerBooted,
        previewUrl,
        isPreviewOpen,
        setIsPreviewOpen,
        run: runProject,
        build: buildProject,
        test: testProject,
        mountAll: mountAllFiles,
        isRuntimeTaskRunning,
        runtimeCommands,
        runtimeLogs,
        runtimeError
    } = useExecutionEngine({
        files,
        activeFileId,
        fileContents,
        terminalInstance,
        workspacePrefix: activeWorkspace,
        envSecrets
    });

    // Diff Modal State
    const [diffModalOpen, setDiffModalOpen] = useState(false);
    const [diffContent, setDiffContent] = useState({ original: "", modified: "", language: "typescript" });

    // Layout State (synced)
    const { settings, updateSetting } = useIDESettings();
    const showSidebar = settings.showSidebar;
    const setShowSidebar = useCallback((val: boolean) => updateSetting("showSidebar", val), [updateSetting]);

    const activeSidebarTab = settings.activeSidebarTab;
    const setActiveSidebarTab = useCallback((val: SidebarTab) => updateSetting("activeSidebarTab", val), [updateSetting]);

    const showAIChat = settings.showAIChat;
    const setShowAIChat = useCallback((val: boolean) => updateSetting("showAIChat", val), [updateSetting]);

    const showAIEditor = settings.showAIEditor;
    const setShowAIEditor = useCallback((val: boolean) => updateSetting("showAIEditor", val), [updateSetting]);

    const showTerminal = settings.showTerminal;
    const setShowTerminal = useCallback((val: boolean) => updateSetting("showTerminal", val), [updateSetting]);

    const showDocPreview = settings.showDocPreview;
    const setShowDocPreview = useCallback((val: boolean) => updateSetting("showDocPreview", val), [updateSetting]);

    const showLocalTopology = settings.showLocalTopology;
    const setShowLocalTopology = useCallback((val: boolean) => updateSetting("showLocalTopology", val), [updateSetting]);

    const [localMermaid, setLocalMermaid] = useState<string>("");
    const editorRef = useRef<SimpleEnhancedEditorRef>(null);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorColumn, setCursorColumn] = useState(1);
    const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
    const [terminalMaximized, setTerminalMaximized] = useState(false);
    const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");

    const monacoInstanceRef = useRef<Monaco | null>(null);
    const runRequestInFlightRef = useRef(false);
    const [showSecretsManager, setShowSecretsManager] = useState(false);
    const [deleteProjectTarget, setDeleteProjectTarget] = useState<string | null>(null);
    const [isDeletingProject, setIsDeletingProject] = useState(false);
    const deleteProjectFileCount = useMemo(() => {
        return deleteProjectTarget ? filterFilesByWorkspace(files, deleteProjectTarget).length : 0;
    }, [deleteProjectTarget, files]);

    // Handle query parameter for auto-opening files
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setShowSidebar(false);
        }
    }, [setShowSidebar]);

    useEffect(() => {
        // Accept both the new `?fileId=<db-id>` contract (preferred) and
        // the legacy `?file=<name-or-id>` for backward compatibility.
        const fileIdParam = searchParams.get('fileId');
        const fileNameParam = searchParams.get('file');
        const target = fileIdParam ?? fileNameParam;
        if (!target) return;

        const file = files.find(f => f.id === target || f.name === target);
        if (file) {
            handleFileSelect(file.id);
            toast(`Opened ${file.name} from Architecture Map`, "success");
        }
    }, [searchParams, files, handleFileSelect, toast]);

    // Fetch local topology for active file
    useEffect(() => {
        if (showLocalTopology) {
            getProjectGraphMermaid()
                .then((result) => {
                    if (result.isRealData) {
                        setLocalMermaid(result.mermaid);
                    } else {
                        setLocalMermaid("");
                    }
                })
                .catch(() => setLocalMermaid(""));
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

    const handleProjectDeleteRequest = useCallback((workspace: string) => {
        if (workspace === "Project") {
            toast("Select a concrete project workspace before deleting", "warning");
            return;
        }

        setDeleteProjectTarget(workspace);
    }, [toast]);

    const handleDeleteProject = useCallback(async () => {
        if (!deleteProjectTarget || isDeletingProject) return;

        setIsDeletingProject(true);
        try {
            const res = await fetch(`/api/ide/projects/${encodeURIComponent(deleteProjectTarget)}`, { method: "DELETE" });
            const data = (await res.json().catch(() => ({}))) as {
                deletedCount?: number;
                deletedFileIds?: unknown;
                message?: string;
                error?: string;
            };

            if (!res.ok) {
                throw new Error(data.message || data.error || "Failed to delete project");
            }

            const deletedFileIds = Array.isArray(data.deletedFileIds)
                ? data.deletedFileIds.filter((id): id is string => typeof id === "string")
                : filterFilesByWorkspace(files, deleteProjectTarget).map((file) => file.id);

            removeFiles(deletedFileIds);
            if (activeWorkspace === deleteProjectTarget) {
                setActiveWorkspace("Project");
            }
            setDeleteProjectTarget(null);

            if (webContainerBooted) {
                const remainingFiles = files.filter((file) => !deletedFileIds.includes(file.id));
                await mountAllFiles(remainingFiles);
            }

            toast(`Deleted ${deleteProjectTarget} (${data.deletedCount ?? deletedFileIds.length} files)`, "success");
        } catch (error) {
            toast(error instanceof Error ? error.message : "Failed to delete project", "error");
        } finally {
            setIsDeletingProject(false);
        }
    }, [activeWorkspace, deleteProjectTarget, files, isDeletingProject, mountAllFiles, removeFiles, toast, webContainerBooted]);



    const handleRunProject = async () => {
        if (runRequestInFlightRef.current || runStatus === 'installing' || runStatus === 'starting' || isRuntimeTaskRunning) return;

        runRequestInFlightRef.current = true;
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
        } finally {
            runRequestInFlightRef.current = false;
        }
    };

    const handleRuntimeTask = async (task: "build" | "test") => {
        if (runRequestInFlightRef.current || runStatus === 'installing' || runStatus === 'starting' || isRuntimeTaskRunning) return;

        runRequestInFlightRef.current = true;
        setShowTerminal(true);

        try {
            await (task === "build" ? buildProject() : testProject());
            toast(`${task === "build" ? "Build" : "Test"} completed`, "success");
        } catch (error) {
            toast(error instanceof Error ? error.message : `${task === "build" ? "Build" : "Test"} failed`, "error");
        } finally {
            runRequestInFlightRef.current = false;
        }
    };

    const handleBuildProject = () => {
        void handleRuntimeTask("build");
    };

    const handleTestProject = () => {
        void handleRuntimeTask("test");
    };



    



    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

    // Hotkeys
    useIDEHotkeys({
        onSave: handleSave,
        onToggleSidebar: () => setShowSidebar(!showSidebar),
        onCommandPalette: () => setIsCommandPaletteOpen(true),
        onToggleAIChat: () => setShowAIChat(!showAIChat),
        onToggleTerminal: () => setShowTerminal(!showTerminal)
    });

    const activeFile = files.find(f => f.id === activeFileId);
    const sidebarSearchResults = useMemo(() => {
        const query = sidebarSearchQuery.trim().toLowerCase();
        if (query.length < 2) return [];

        return visibleFiles
            .filter(file => {
                const content = fileContents[file.id] ?? file.content ?? "";
                return file.name.toLowerCase().includes(query) || content.toLowerCase().includes(query);
            })
            .slice(0, 50);
    }, [visibleFiles, fileContents, sidebarSearchQuery]);

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
                        type="button"
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
                        type="button"
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
                        <div className="p-3 border-b border-white/[0.04]">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/25 mb-2">
                                <FolderOpen className="w-3 h-3" />
                                Workspace
                            </label>
                            <select
                                value={activeWorkspace}
                                onChange={(event) => setActiveWorkspace(event.target.value)}
                                className="w-full rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                            >
                                {workspaceOptions.map(workspace => (
                                    <option key={workspace} value={workspace}>
                                        {workspace}
                                    </option>
                                ))}
                            </select>
                            {activeWorkspace !== "Project" && (
                                <button
                                    type="button"
                                    onClick={() => handleProjectDeleteRequest(activeWorkspace)}
                                    className="mt-2 w-full rounded-md border border-red-500/15 bg-red-500/5 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-red-300/80 transition-colors hover:bg-red-500/10 hover:text-red-200"
                                >
                                    Delete Project
                                </button>
                            )}
                        </div>
                        {activeSidebarTab === "explorer" && (
                            <FileTreeContainer
                                activeFileId={activeFileId}
                                files={visibleFiles}
                                workspacePrefix={activeWorkspace}
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
                                onProjectDeleteRequest={handleProjectDeleteRequest}
                            />
                        )}
                        {activeSidebarTab === "search" && (
                            <div className="flex flex-col h-full">
                                <div className="p-4 border-b border-white/[0.04]">
                                    <h2 className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">Search</h2>
                                    <div className="relative">
                                        <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                        <input
                                            value={sidebarSearchQuery}
                                            onChange={(event) => setSidebarSearchQuery(event.target.value)}
                                            placeholder="Search in project..."
                                            className="w-full bg-black/20 border border-white/[0.06] rounded-md pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/30 transition-all"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2">
                                    {sidebarSearchQuery.trim().length < 2 ? (
                                        <div className="h-full flex items-center justify-center p-4 text-center">
                                            <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">Type at least 2 chars to search</p>
                                        </div>
                                    ) : sidebarSearchResults.length === 0 ? (
                                        <div className="h-full flex items-center justify-center p-4 text-center">
                                            <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">No results found</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {sidebarSearchResults.map(file => (
                                                <button
                                                    type="button"
                                                    key={file.id}
                                                    onClick={() => handleFileSelect(file.id)}
                                                    className={cn(
                                                        "w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.05] text-left transition-colors",
                                                        activeFileId === file.id ? "bg-purple-500/10 text-purple-300" : "text-white/55"
                                                    )}
                                                >
                                                    <FileText className="w-3.5 h-3.5 shrink-0 text-white/30" />
                                                    <span className="text-[11px] truncate">{file.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
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
                    canShare={Boolean(activeFile)}
                    onDeploy={handleRunProject}
                    onBuild={handleBuildProject}
                    onTest={handleTestProject}
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
                    <EditorTabs
                        openFiles={openFiles}
                        files={files}
                        activeFileId={activeFileId}
                        unsavedChanges={unsavedChanges}
                        onFileSelect={handleFileSelect}
                        onCloseFile={handleCloseFile}
                    />

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
                        handleBuildProject={handleBuildProject} handleTestProject={handleTestProject}
                        runStatus={runStatus}
                        isRuntimeTaskRunning={isRuntimeTaskRunning}
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
                                onSelectTemplate={async (templateFiles, projectName = "Project") => {
                                    try {
                                        const baseSlug = slugifyProjectName(projectName);
                                        const existingWorkspaces = new Set(workspaceOptions.map(workspace => workspace.toLowerCase()));
                                        let projectSlug = baseSlug;
                                        let suffix = 2;

                                        while (existingWorkspaces.has(projectSlug.toLowerCase())) {
                                            projectSlug = `${baseSlug}-${suffix}`;
                                            suffix += 1;
                                        }

                                        const projectFiles = templateFiles.map(file => ({
                                            ...file,
                                            name: `${projectSlug}/${file.name.replace(/^\/+/, "")}`,
                                        }));

                                        // Use the new bulk-create API for efficiency
                                        const res = await fetch("/api/files/bulk-create", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ files: projectFiles })
                                        });

                                        if (res.ok) {
                                            const data = (await res.json()) as { files?: IDEFile[] };
                                            const createdFiles = data.files || [];

                                            // Update state with all new files
                                            createdFiles.forEach((createdFile) => {
                                                upsertFile(createdFile, {
                                                    initialContent: createdFile.content || "",
                                                });
                                            });

                                            // Auto-open the first file if available
                                            if (createdFiles.length > 0) {
                                                setActiveWorkspace(projectSlug);
                                                upsertFile(createdFiles[0], {
                                                    open: true,
                                                    makeActive: true,
                                                    initialContent: createdFiles[0].content || "",
                                                });
                                            }

                                            toast(`Created ${projectSlug} with ${createdFiles.length} files`, "success");

                                            // Synchronize all new files to WebContainer immediately
                                            if (webContainerBooted) {
                                                await mountAllFiles([...files, ...createdFiles]);
                                            }
                                        } else {
                                            toast(await getResponseErrorMessage(res, "Failed to create template files"), "error");
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
                                <DiagramViewer code={localMermaid} type="flowchart" onNodeClick={(filePath) => {
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
                        runtimeError={runtimeError}
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
                        runtimeErrorLines={runtimeLogs}
                        previewUrl={previewUrl}
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
                            } catch {
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
                    if (activeFileId) {
                        replaceFileContent(activeFileId, diffContent.modified, true);
                    }
                    setDiffModalOpen(false);
                    toast("Diff applied", "success");
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
                        case 'run-project': void handleRunProject(); break;
                        case 'build-project': handleBuildProject(); break;
                        case 'test-project': handleTestProject(); break;
                        case 'toggle-terminal': setShowTerminal(!showTerminal); break;
                        case 'toggle-sidebar': setShowSidebar(!showSidebar); break;
                        case 'toggle-minimap': {
                            if (!editorRef.current) {
                                toast("Open a file before toggling the minimap", "warning");
                                break;
                            }
                            const enabled = editorRef.current?.toggleMinimap();
                            toast(`Minimap ${enabled ? 'enabled' : 'disabled'}`, 'success');
                            break;
                        }
                        case 'format-document':
                            if (!editorRef.current) {
                                toast("Open a file before formatting", "warning");
                                break;
                            }
                            editorRef.current?.formatDocument();
                            toast("Format document requested", "success");
                            break;
                        case 'go-to-settings': setShowKeyboardShortcuts(true); break;
                        case 'toggle-wordwrap': {
                            if (!editorRef.current) {
                                toast("Open a file before toggling word wrap", "warning");
                                break;
                            }
                            const enabled = editorRef.current?.toggleWordWrap();
                            toast(`Word wrap ${enabled ? 'enabled' : 'disabled'}`, 'success');
                            break;
                        }
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
            <DeleteProjectDialog
                key={deleteProjectTarget || "delete-project"}
                open={Boolean(deleteProjectTarget)}
                workspace={deleteProjectTarget}
                fileCount={deleteProjectFileCount}
                isDeleting={isDeletingProject}
                onOpenChange={(open) => !open && setDeleteProjectTarget(null)}
                onConfirm={handleDeleteProject}
            />
        </div>
    );
}
