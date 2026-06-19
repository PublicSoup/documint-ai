"use client";

import { WebContainerManager } from "@/lib/web-container";
import type { SimpleEnhancedEditorRef } from "./simple-enhanced-editor";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

import type { Monaco } from "@monaco-editor/react";
import type { Terminal as XTerm } from "@xterm/xterm";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { LivePreview } from "./live-preview";
import NotificationsBell from "../notifications-bell";
import { useSearchParams } from "next/navigation";
import { useToast } from "../toast";
import { AIChatPanel } from "./ai-chat-panel";

import { useExecutionEngine } from "@/hooks/use-execution-engine";
import { EditorTabs } from "./editor-tabs";
import { SecretsManager } from "./secrets-manager";
import { IDEStatusBar } from "./status-bar";
import { ContextualHeader } from "./contextual-header";
import { getProjectGraphMermaid } from "@/app/dashboard/client-actions";
import { CommandPalette } from "./command-palette";
import { DiffModal } from "./diff-modal";
import { useIDESettings } from "@/hooks/use-ide-settings";
import { loadTypesFromWebContainer } from "@/lib/monaco-type-loader";
import { useIDEFileManager } from "@/hooks/use-ide-file-manager";
import { useIDEHotkeys } from "@/hooks/use-ide-hotkeys";
import { IDEToolbar } from "./ide-toolbar";
import { IDEEditorWorkspace } from "./editor-workspace";
import { TerminalPanel } from "./terminal-panel";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { IDEActivityBar } from "./activity-bar";
import { IDEInspectorPanels } from "./ide-inspector-panels";
import { IDESidebar } from "./ide-sidebar";
import type { IDEFile, IDEUser, SidebarTab, SubscriptionInfo } from "./shared/types";
import { choosePreferredWorkspace, detectRuntimeProject, extractTopLevelFolders, filterFilesByWorkspace, getResponseErrorMessage, slugifyProjectName } from "./shared/ide-constants";

interface EnhancedIDELayoutProps {
    files: IDEFile[];
    user: IDEUser;
    subscription?: SubscriptionInfo;
}

function parsePackageScripts(content: string | null | undefined): Record<string, string> {
    if (!content) return {};
    try {
        const parsed = JSON.parse(content) as { scripts?: unknown };
        if (!parsed.scripts || typeof parsed.scripts !== "object" || Array.isArray(parsed.scripts)) return {};
        return Object.fromEntries(
            Object.entries(parsed.scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string")
        );
    } catch {
        return {};
    }
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

    useEffect(() => {
        if (activeWorkspace !== "Project") return;
        const preferredWorkspace = choosePreferredWorkspace(files);
        if (preferredWorkspace) setActiveWorkspace(preferredWorkspace);
    }, [activeWorkspace, files]);
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
        bootRuntime,
        isRuntimeTaskRunning,
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

    const showAIImproveAction = settings.showAIEditor;
    const setShowAIImproveAction = useCallback((val: boolean) => updateSetting("showAIEditor", val), [updateSetting]);

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

    const runtimeCapabilities = useMemo(() => {
        const runtimeProject = detectRuntimeProject(files, activeWorkspace);
        const packageFile = runtimeProject.kind === "node" ? runtimeProject.packageFile : undefined;
        const packageContent = packageFile ? fileContents[packageFile.id] ?? packageFile.content ?? "" : "";
        const scripts = parsePackageScripts(packageContent);
        const isRuntimeBusy = runStatus === "installing" || runStatus === "starting" || isRuntimeTaskRunning;
        const busyReason = runStatus === "installing"
            ? "Installing dependencies"
            : runStatus === "starting"
                ? "Starting runtime"
                : isRuntimeTaskRunning
                    ? "Runtime task already running"
                    : undefined;
        const requiresPackage = "Requires package.json in the selected workspace";

        return {
            isRuntimeBusy,
            runtimeStatusLabel: busyReason,
            canRun: !isRuntimeBusy,
            canBuild: Boolean(packageFile && scripts.build) && !isRuntimeBusy,
            canTest: Boolean(packageFile && scripts.test) && !isRuntimeBusy,
            runDisabledReason: busyReason,
            buildDisabledReason: busyReason || (packageFile ? "No scripts.build found in package.json" : requiresPackage),
            testDisabledReason: busyReason || (packageFile ? "No scripts.test found in package.json" : requiresPackage),
        };
    }, [activeWorkspace, fileContents, files, isRuntimeTaskRunning, runStatus]);

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
                await mountAllFiles(remainingFiles, activeWorkspace === deleteProjectTarget ? "Project" : activeWorkspace);
            }

            toast(`Deleted ${deleteProjectTarget} (${data.deletedCount ?? deletedFileIds.length} files)`, "success");
        } catch (error) {
            toast(error instanceof Error ? error.message : "Failed to delete project", "error");
        } finally {
            setIsDeletingProject(false);
        }
    }, [activeWorkspace, deleteProjectTarget, files, isDeletingProject, mountAllFiles, removeFiles, toast, webContainerBooted]);



    const handleRunProject = async () => {
        if (runRequestInFlightRef.current || !runtimeCapabilities.canRun) return;

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
        const canExecute = task === "build" ? runtimeCapabilities.canBuild : runtimeCapabilities.canTest;
        if (runRequestInFlightRef.current || !canExecute) {
            toast(task === "build" ? runtimeCapabilities.buildDisabledReason || "Build unavailable" : runtimeCapabilities.testDisabledReason || "Test unavailable", "warning");
            return;
        }

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

    const handleSelectTemplate = useCallback(async (templateFiles: { name: string; content: string }[], projectName = "Project") => {
        try {
            const baseSlug = slugifyProjectName(projectName);
            const existingWorkspaces = new Set(workspaceOptions.map((workspace) => workspace.toLowerCase()));
            let projectSlug = baseSlug;
            let suffix = 2;

            while (existingWorkspaces.has(projectSlug.toLowerCase())) {
                projectSlug = `${baseSlug}-${suffix}`;
                suffix += 1;
            }

            const projectFiles = templateFiles.map((file) => ({
                ...file,
                name: `${projectSlug}/${file.name.replace(/^\/+/, "")}`,
            }));

            const res = await fetch("/api/files/bulk-create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ files: projectFiles }),
            });

            if (!res.ok) {
                toast(await getResponseErrorMessage(res, "Failed to create template files"), "error");
                return;
            }

            const data = (await res.json()) as { files?: IDEFile[] };
            const createdFiles = data.files || [];

            createdFiles.forEach((createdFile) => {
                upsertFile(createdFile, {
                    initialContent: createdFile.content || "",
                });
            });

            const [firstCreatedFile] = createdFiles;
            if (firstCreatedFile) {
                setActiveWorkspace(projectSlug);
                upsertFile(firstCreatedFile, {
                    open: true,
                    makeActive: true,
                    initialContent: firstCreatedFile.content || "",
                });
            }

            toast(`Created ${projectSlug} with ${createdFiles.length} files`, "success");

            if (webContainerBooted) {
                await mountAllFiles([...files, ...createdFiles], projectSlug);
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Error initializing template", "error");
        }
    }, [files, mountAllFiles, toast, upsertFile, webContainerBooted, workspaceOptions]);

    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

    const handleBeforeTerminalCommand = useCallback(async () => {
        const booted = await bootRuntime();
        if (!booted) throw new Error("WebContainer failed to boot before terminal command");
        await mountAllFiles(files, activeWorkspace);
        return undefined;
    }, [activeWorkspace, bootRuntime, files, mountAllFiles]);

    // Hotkeys
    useIDEHotkeys({
        onSave: handleSave,
        onToggleSidebar: () => setShowSidebar(!showSidebar),
        onCommandPalette: () => setIsCommandPaletteOpen(true),
        onToggleAIChat: () => setShowAIChat(!showAIChat),
        onToggleTerminal: () => setShowTerminal(!showTerminal),
        onRun: handleRunProject
    });

    const activeFile = files.find(f => f.id === activeFileId);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#030014] text-white fixed inset-0 z-[100] selection:bg-purple-500/30">
            <IDEActivityBar
                activeSidebarTab={activeSidebarTab}
                showSidebar={showSidebar}
                showTerminal={showTerminal}
                onActiveSidebarTabChange={setActiveSidebarTab}
                onShowSidebarChange={setShowSidebar}
                onShowTerminalChange={setShowTerminal}
                onOpenKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
            />

            {showSidebar && (
                <IDESidebar
                    activeSidebarTab={activeSidebarTab}
                    activeFileId={activeFileId}
                    activeWorkspace={activeWorkspace}
                    workspaceOptions={workspaceOptions}
                    visibleFiles={visibleFiles}
                    fileContents={fileContents}
                    searchQuery={sidebarSearchQuery}
                    onSearchQueryChange={setSidebarSearchQuery}
                    onWorkspaceChange={setActiveWorkspace}
                    onCloseSidebar={() => setShowSidebar(false)}
                    onSelectFile={handleFileSelect}
                    onFileCreated={(newFile) => {
                        upsertFile(newFile, {
                            open: true,
                            makeActive: true,
                            initialContent: newFile.content || "",
                        });
                    }}
                    onFileRenamed={renameFile}
                    onFileDeleted={removeFile}
                    onProjectDeleteRequest={handleProjectDeleteRequest}
                />
            )}

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 max-w-full bg-[#030014] relative z-10 h-full overflow-hidden">
                <ContextualHeader
                    filePath={activeFile?.name || "No file selected"}
                    isSaving={isSaving}
                    runtimeStatusLabel={runtimeCapabilities.runtimeStatusLabel}
                    canRun={runtimeCapabilities.canRun}
                    canBuild={runtimeCapabilities.canBuild}
                    canTest={runtimeCapabilities.canTest}
                    runDisabledReason={runtimeCapabilities.runDisabledReason}
                    buildDisabledReason={runtimeCapabilities.buildDisabledReason}
                    testDisabledReason={runtimeCapabilities.testDisabledReason}
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
                    onKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
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
                        showAIImproveAction={showAIImproveAction} setShowAIImproveAction={setShowAIImproveAction}
                        showDocPreview={showDocPreview} setShowDocPreview={setShowDocPreview}
                        showLocalTopology={showLocalTopology} setShowLocalTopology={setShowLocalTopology}
                        activeFileId={activeFileId} activeFile={activeFile}
                        fileContents={fileContents} replaceFileContent={replaceFileContent}
                        unsavedChanges={unsavedChanges}
                        handleSave={handleSave}
                        setShowSecretsManager={setShowSecretsManager}
                    />
                </div>

                <div className="flex-1 relative min-h-0 overflow-hidden flex">
                    <IDEEditorWorkspace
                        activeFile={activeFile}
                        activeFileId={activeFileId}
                        code={activeFileId ? fileContents[activeFileId] : undefined}
                        showInspector={showDocPreview || showLocalTopology}
                        editorRef={editorRef}
                        onChange={handleContentChange}
                        onSave={handleSave}
                        onRun={handleRunProject}
                        onMonacoMount={(monaco) => {
                            monacoInstanceRef.current = monaco;
                        }}
                        onCursorChange={(line, column) => {
                            setCursorLine(line);
                            setCursorColumn(column);
                        }}
                        onSelectTemplate={handleSelectTemplate}
                    />

                    <IDEInspectorPanels
                        activeFile={activeFile}
                        activeFileId={activeFileId}
                        files={files}
                        showDocPreview={showDocPreview}
                        showLocalTopology={showLocalTopology}
                        localMermaid={localMermaid}
                        onCloseDocPreview={() => setShowDocPreview(false)}
                        onCloseLocalTopology={() => setShowLocalTopology(false)}
                        onSelectFile={handleFileSelect}
                        onNotify={toast}
                    />
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

                {/* Terminal Panel */}
                {showTerminal && (
                    <TerminalPanel
                        terminalMaximized={terminalMaximized}
                        setTerminalMaximized={setTerminalMaximized}
                        setShowTerminal={setShowTerminal}
                        setTerminalInstance={setTerminalInstance}
                        onBeforeCommand={handleBeforeTerminalCommand}
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
                runtimeAvailability={runtimeCapabilities}
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
