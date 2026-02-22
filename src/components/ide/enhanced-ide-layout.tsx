"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { SimpleEnhancedEditor, SimpleEnhancedEditorRef } from "./simple-enhanced-editor";
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
import { EnhancedFileTree } from "./enhanced-file-tree";
import { WebContainerManager } from "@/lib/web-container";
import { Terminal as XTerm } from '@xterm/xterm';
import { useExecutionEngine } from "@/hooks/use-execution-engine";
import { RunnerConfigDialog } from "./runner-config-dialog";
import { ActivityBar } from "./activity-bar";
import { Sidebar } from "./sidebar";
import { EditorTabs } from "./editor-tabs";
import { SecretsManager } from "./secrets-manager";
import { IDEStatusBar } from "./status-bar";
import ReadmeGenerator from "../readme-generator";
import { ContextualHeader } from "./contextual-header";
import { getProjectGraphMermaid } from "@/app/dashboard/actions";
import { CommandPalette } from "../command-palette";
import { DiffModal } from "./diff-modal";
import { useIDESettings } from "@/hooks/use-ide-settings";
import { loadTypesFromWebContainer } from "@/lib/monaco-type-loader";
import type { Monaco } from "@monaco-editor/react";

const DiagramViewer = dynamic(() => import("../diagram-viewer").then(mod => mod.DiagramViewer), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-[300px] text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Rendering Topology...
        </div>
    )
});

const Terminal = dynamic(() => import("./terminal").then(mod => mod.Terminal), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-32 bg-[#020010] text-white/20 font-mono text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Connecting to Runtime...
        </div>
    )
});

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



interface EnhancedIDELayoutProps {
    files: (File & { content?: string | null })[];
    user: any;
    subscription?: any; // Added for compatibility
}

export default function EnhancedIDELayout({ files: initialFiles, user, subscription }: EnhancedIDELayoutProps) {
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const [files, setFiles] = useState(initialFiles);
    const [activeFileId, setActiveFileId] = useState<string | undefined>(initialFiles[0]?.id);
    const [openFiles, setOpenFiles] = useState<string[]>(initialFiles.length > 0 ? [initialFiles[0].id] : []);
    const [fileContents, setFileContents] = useState<Record<string, string>>({});
    const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);

    // WebContainer State
    const [webContainerBooted, setWebContainerBooted] = useState(false);
    const [terminalInstance, setTerminalInstance] = useState<XTerm | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);

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

    const handleFileSelect = async (fileId: string) => {
        if (!openFiles.includes(fileId)) {
            setOpenFiles([...openFiles, fileId]);
        }
        setActiveFileId(fileId);

        // If content not loaded, fetch it
        if (!fileContents[fileId]) {
            try {
                const res = await fetch(`/api/files/${fileId}/raw`);
                const data = await res.json();
                if (data.content !== undefined) {
                    setFileContents(prev => ({ ...prev, [fileId]: data.content }));
                } else {
                    // New/empty file — set empty string so editor shows blank
                    setFileContents(prev => ({ ...prev, [fileId]: "" }));
                }
            } catch (e) {
                toast("Failed to load file content", "error");
            }
        }
    };

    const handleCloseFile = (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        const newOpen = openFiles.filter(id => id !== fileId);
        setOpenFiles(newOpen);
        if (activeFileId === fileId) {
            setActiveFileId(newOpen[newOpen.length - 1]);
        }
    };

    const handleContentChange = (val: string | undefined) => {
        if (activeFileId && val !== undefined) {
            setFileContents(prev => ({ ...prev, [activeFileId]: val }));
            setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
        }
    };

    const handleRunProject = async () => {
        if (!webContainerBooted || !terminalInstance) {
            toast("runtime not ready", "error");
            return;
        }

        setIsInstalling(true);
        setShowTerminal(true);
        setIsPreviewOpen(true);

        try {
            const wc = await WebContainerManager.getInstance();

            // Install dependencies
            terminalInstance.writeln("\r\n> npm install\r\n");
            const installProcess = await wc.spawn('npm', ['install']);
            installProcess.output.pipeTo(new WritableStream({
                write(data) {
                    terminalInstance.write(data);
                }
            }));

            if ((await installProcess.exit) !== 0) {
                throw new Error("Installation failed");
            }

            // Load type definitions from installed packages into Monaco
            if (monacoInstanceRef.current) {
                try {
                    const count = await loadTypesFromWebContainer(wc, monacoInstanceRef.current);
                    if (count > 0) {
                        setTypesLoaded(true);
                        toast(`Loaded ${count} type definitions — IntelliSense active`, "success");
                    }
                } catch (e) {
                    console.warn("Type loading failed (non-critical):", e);
                }
            }

            // Start Dev Server
            terminalInstance.writeln("\r\n> npm run dev\r\n");
            const devProcess = await wc.spawn('npm', ['run', 'dev']);
            devProcess.output.pipeTo(new WritableStream({
                write(data) {
                    terminalInstance.write(data);
                }
            }));

            setIsInstalling(false);
        } catch (e) {
            terminalInstance.writeln(`\r\nError: ${e}\r\n`);
            setIsInstalling(false);
        }
    };

    const handleSave = async () => {
        if (!activeFileId || !unsavedChanges[activeFileId]) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/files/${activeFileId}/raw`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: fileContents[activeFileId] })
            });

            if (res.ok) {
                setUnsavedChanges(prev => ({ ...prev, [activeFileId]: false }));
                toast("File saved successfully", "success");
            } else {
                throw new Error("Save failed");
            }
        } catch (e) {
            toast("Failed to save changes", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateFile = async () => {
        const fileName = prompt("Enter file name (e.g., myFile.ts, styles.css):");
        if (!fileName) return;

        try {
            const res = await fetch("/api/files/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: fileName })
            });

            if (res.ok) {
                const newFile = await res.json();
                // Add to file list state so it appears immediately (no reload needed)
                setFiles(prev => [...prev, newFile]);
                // Auto-open the new file
                setFileContents(prev => ({ ...prev, [newFile.id]: newFile.content || "" }));
                setOpenFiles(prev => [...prev, newFile.id]);
                setActiveFileId(newFile.id);
                toast(`Created ${fileName}`, "success");
            } else {
                const text = await res.text();
                toast(text || "Failed to create file", "error");
            }
        } catch (e) {
            toast("Failed to create file", "error");
        }
    };

    // Boot WebContainer
    useEffect(() => {
        const boot = async () => {
            try {
                const wc = await WebContainerManager.getInstance();
                setWebContainerBooted(true);

                // Mount initial files (using state 'files' to be safe, though initially same as initialFiles)
                const fileMounts: Record<string, { file: { contents: string } }> = {};

                // Process files
                // Helper to ensure directory structure exists
                const ensureDir = (root: any, pathParts: string[]) => {
                    let current = root;
                    for (const part of pathParts) {
                        if (!current[part]) {
                            current[part] = { directory: {} };
                        }
                        current = current[part].directory;
                    }
                    return current;
                };

                // Process files
                files.forEach(f => {
                    let name = f.name;
                    if (!name) return;

                    name = name.trim();

                    // Sanitize
                    if (name.startsWith('//') || name.startsWith('#') || name.includes('\n') || !name.match(/^[a-zA-Z0-9@._\-\/]+$/)) {
                        console.warn("Skipping invalid file mount:", name);
                        return;
                    }

                    // Handle nested paths (e.g. src/components/button.tsx)
                    if (name.includes('/')) {
                        const parts = name.split('/');
                        const fileName = parts.pop()!;
                        const dirParts = parts;

                        const dir = ensureDir(fileMounts, dirParts);
                        dir[fileName] = { file: { contents: f.content || "" } };
                    } else {
                        // Flat file
                        fileMounts[name] = { file: { contents: f.content || "" } };
                    }
                });

                // Add package.json if missing (for React/Next support)
                if (!fileMounts['package.json']) {
                    fileMounts['package.json'] = {
                        file: {
                            contents: JSON.stringify({
                                name: "documint-preview",
                                private: true,
                                scripts: {
                                    "dev": "next dev",
                                    "build": "next build",
                                    "start": "next start"
                                },
                                dependencies: {
                                    "next": "latest",
                                    "react": "latest",
                                    "react-dom": "latest"
                                }
                            }, null, 2)
                        }
                    };
                }

                await wc.mount(fileMounts);

                // Listen for server-ready
                wc.on('server-ready', (port, url) => {
                    setPreviewUrl(url);
                    setIsPreviewOpen(true);
                    toast("Development server ready!", "success");
                });

            } catch (e) {
                console.error("WebContainer Boot Error:", e);
                // toast("Failed to boot runtime environment. Check console.", "error");
            }
        };

        boot();
    }, []); // Run once on mount

    // Sync file changes to WebContainer
    useEffect(() => {
        const syncFile = async () => {
            if (activeFileId && fileContents[activeFileId] && webContainerBooted) {
                // Must search in current dynamic files state
                const file = files.find(f => f.id === activeFileId);
                if (file) {
                    try {
                        await WebContainerManager.writeFile(file.name, fileContents[activeFileId]);
                    } catch (e) {
                        console.error("Failed to sync file to WC:", e);
                    }
                }
            }
        };
        const timeout = setTimeout(syncFile, 500); // Debounce
        return () => clearTimeout(timeout);
    }, [fileContents, activeFileId, webContainerBooted, files]); // Added files dependency


    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

    // Hotkeys
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCmd = e.ctrlKey || e.metaKey;

            // Don't intercept if user is typing in an input or textarea
            const target = e.target as HTMLElement;
            const isEditing = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('.monaco-editor');

            if (isCmd && !isEditing) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        handleSave();
                        break;
                    case 'b':
                        e.preventDefault();
                        setShowSidebar(!showSidebar); // Toggle
                        break;
                    case 'k':
                        e.preventDefault();
                        setIsCommandPaletteOpen(true);
                        break;
                    case 'i':
                        e.preventDefault();
                        setShowAIChat(!showAIChat); // Toggle
                        break;
                    case '`':
                        e.preventDefault();
                        setShowTerminal(!showTerminal);
                        break;
                }
            } else if (isCmd && isEditing) {
                // Allow Cmd+S and Cmd+K even when in editor
                if (e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    handleSave();
                } else if (e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    setIsCommandPaletteOpen(true);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeFileId, fileContents, unsavedChanges, showSidebar, showAIChat, showTerminal]);

    const activeFile = files.find(f => f.id === activeFileId);



    const handleAction = async (action: "ai" | "delete" | "rename" | "new_file" | "new_folder" | "refresh", fileId?: string) => {
        if (action === "new_file") {
            // If fileId contains a path (from folder context menu), pre-fill it
            if (fileId && fileId.includes('/')) {
                const fileName = prompt(`Enter file name (will be created in ${fileId}):`);
                if (!fileName) return;
                const fullName = `${fileId}/${fileName}`;
                try {
                    const res = await fetch("/api/files/create", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: fullName })
                    });
                    if (res.ok) {
                        const newFile = await res.json();
                        setFiles(prev => [...prev, newFile]);
                        setFileContents(prev => ({ ...prev, [newFile.id]: newFile.content || "" }));
                        setOpenFiles(prev => [...prev, newFile.id]);
                        setActiveFileId(newFile.id);
                        toast(`Created ${fullName}`, "success");
                    } else {
                        const text = await res.text();
                        toast(text || "Failed to create file", "error");
                    }
                } catch (e) {
                    toast("Failed to create file", "error");
                }
            } else {
                await handleCreateFile();
            }
        } else if (action === "new_folder") {
            toast("Create a file inside the folder to establish it", "success");
        } else if (action === "refresh") {
            window.location.reload();
        } else if (action === "ai" && fileId) {
            setActiveFileId(fileId);
            setShowAIChat(true);
            if (!openFiles.includes(fileId)) {
                setOpenFiles([...openFiles, fileId]);
            }
        } else if (action === "rename" && fileId) {
            const file = files.find(f => f.id === fileId);
            const newName = prompt("Enter new file name:", file?.name || "");
            if (!newName || newName === file?.name) return;
            try {
                const res = await fetch(`/api/files/move`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fileId, newName })
                });
                if (res.ok) {
                    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName, language: getLanguageFromFileName(newName) } : f));
                    toast(`Renamed to ${newName}`, "success");
                } else {
                    toast("Failed to rename file", "error");
                }
            } catch (e) {
                toast("Failed to rename file", "error");
            }
        } else if (action === "delete" && fileId) {
            if (confirm("Are you sure you want to delete this file?")) {
                try {
                    const res = await fetch(`/api/files/${fileId}/raw`, { method: "DELETE" });
                    if (res.ok) {
                        // Remove from state instead of reloading
                        setFiles(prev => prev.filter(f => f.id !== fileId));
                        setOpenFiles(prev => prev.filter(id => id !== fileId));
                        if (activeFileId === fileId) {
                            const remaining = openFiles.filter(id => id !== fileId);
                            setActiveFileId(remaining[remaining.length - 1]);
                        }
                        toast("File deleted", "success");
                    } else {
                        toast("Failed to delete file", "error");
                    }
                } catch (e) {
                    toast("Failed to delete", "error");
                }
            }
        }
    };

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
                            <EnhancedFileTree
                                files={files}
                                activeFileId={activeFileId}
                                onSelect={handleFileSelect}
                                onAction={handleAction}
                                onRefresh={async () => {
                                    // Smart refresh: re-fetch file list without full page reload
                                    try {
                                        const res = await fetch('/api/files/list');
                                        if (res.ok) {
                                            const data = await res.json();
                                            if (data.files) {
                                                setFiles(data.files);
                                            }
                                        }
                                    } catch (e) {
                                        // Fallback to full reload if API fails
                                        window.location.reload();
                                    }
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
                            <div className="flex flex-col h-full overflow-hidden">
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                                    <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30">Source Control</h2>
                                    <div className="bg-white/5 rounded-md p-3 border border-white/5">
                                        <p className="text-xs text-white/70 mb-2 font-medium">Staged Changes</p>
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-[11px] text-emerald-400/80 hover:bg-white/5 p-1 rounded group cursor-pointer">
                                                <span className="truncate flex-1">modified: package.json</span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                                    <X className="w-3 h-3 hover:text-red-400" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-white/5 rounded-md p-3 border border-white/5">
                                        <p className="text-xs text-white/70 mb-2 font-medium">Changes</p>
                                        <div className="space-y-1 italic text-white/20 text-[10px]">
                                            No unstaged changes
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 mt-auto border-t border-white/5">
                                    <textarea
                                        placeholder="Message (Cmd+Enter to commit)"
                                        className="w-full bg-black/20 border border-white/10 rounded-md p-2 text-xs text-white focus:outline-none focus:border-primary/50 resize-none h-20 mb-2"
                                    />
                                    <Button className="w-full h-8 text-xs font-bold" size="sm">Commit to main</Button>
                                </div>
                            </div>
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
                                    onClick={() => setActiveFileId(fileId)}
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

                    <div className="flex items-center gap-1 px-2 h-full bg-[#030014]">
                        <button onClick={(e) => {
                            e.stopPropagation();
                            if (clickTimeout) return;
                            const timeout = setTimeout(() => setClickTimeout(null), 300);
                            setClickTimeout(timeout);
                            setShowSidebar(!showSidebar);
                        }} className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/50 transition-all" title="Toggle Sidebar (⌘B)">
                            <Columns className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            if (clickTimeout) return;
                            const timeout = setTimeout(() => setClickTimeout(null), 300);
                            setClickTimeout(timeout);
                            setShowAIChat(!showAIChat);
                        }} className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/50 transition-all" title="Toggle AI Chat (⌘I)">
                            <Bot className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            if (clickTimeout) return;
                            const timeout = setTimeout(() => setClickTimeout(null), 300);
                            setClickTimeout(timeout);
                            setShowTerminal(!showTerminal);
                        }} className="p-1.5 rounded hover:bg-white/[0.06] text-white/30 hover:text-white/50 transition-all" title="Toggle Terminal (⌘`)">
                            <TerminalIcon className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (clickTimeout) return;
                                const timeout = setTimeout(() => setClickTimeout(null), 300);
                                setClickTimeout(timeout);
                                setShowAIEditor(!showAIEditor);
                            }}
                            className={cn("p-1.5 rounded transition-all", showAIEditor ? "bg-purple-500/15 text-purple-400" : "text-purple-400/40 hover:bg-purple-500/10 hover:text-purple-400")}
                            title="Toggle AI Editor"
                        >
                            <Bot className="w-4 h-4" />
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (clickTimeout) return;
                                const timeout = setTimeout(() => setClickTimeout(null), 300);
                                setClickTimeout(timeout);
                                setShowDocPreview(!showDocPreview);
                            }}
                            className={cn("p-1.5 rounded transition-all", showDocPreview ? "bg-blue-500/15 text-blue-400" : "text-blue-400/40 hover:bg-blue-500/10 hover:text-blue-400")}
                            title="Toggle Doc Preview"
                        >
                            <FileText className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => setShowLocalTopology(!showLocalTopology)}
                            className={cn("p-1.5 rounded transition-all", showLocalTopology ? "bg-emerald-500/15 text-emerald-400" : "text-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-400")}
                            title="Toggle Local Topology"
                        >
                            <LayoutIcon className="w-4 h-4" />
                        </button>

                        {/* AI Agent Button - Code Editor Mode */}
                        {showAIEditor && (
                            <button
                                onClick={async () => {
                                    // AI agent functionality - this will connect to /api/chat
                                    const currentContent = activeFileId ? fileContents[activeFileId] : "";
                                    if (currentContent && activeFileId) {
                                        try {
                                            toast("AI is thinking...", "success");
                                            // Send current code to AI for analysis/editing
                                            const res = await fetch("/api/chat", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    message: `Please optimize and improve this code. Return only the improved code block:\n\n${currentContent}`,
                                                    contextFileId: activeFileId,
                                                    contextContent: currentContent,
                                                    stream: false
                                                })
                                            });

                                            const data = await res.json();
                                            if (!res.ok) {
                                                throw new Error(data.error || "Failed to get AI improvement");
                                            }

                                            if (data.reply) {
                                                // Extract code from reply if it's wrapped in markdown
                                                let improvedCode = data.reply;
                                                const codeBlockMatch = improvedCode.match(/```(?:[\w]*)\n([\s\S]*?)```/);
                                                if (codeBlockMatch) {
                                                    improvedCode = codeBlockMatch[1];
                                                }

                                                // Update editor content with AI suggestions
                                                setFileContents(prev => ({ ...prev, [activeFileId]: improvedCode }));
                                                setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
                                                toast("AI improvements applied", "success");
                                            }
                                        } catch (e) {
                                            toast("AI analysis failed", "error");
                                        }
                                    }
                                }}
                                className="p-1.5 rounded hover:bg-amber-500/20 text-amber-500 hover:text-amber-400"
                                title="AI Code Assistant"
                            >
                                <Sparkles className="w-4 h-4" />
                            </button>
                        )}
                        <div className="w-px h-4 bg-white/[0.06] mx-1" />
                        <button
                            onClick={() => {
                                if (activeFile && fileContents[activeFile.id]) {
                                    const blob = new Blob([fileContents[activeFile.id]], { type: 'text/plain' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = activeFile.name.split('/').pop() || 'file.txt';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    toast('File downloaded', 'success');
                                }
                            }}
                            disabled={!activeFileId}
                            className="p-1.5 rounded transition-all text-white/20 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
                            title="Download File"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setShowSecretsManager(true)}
                            className="p-1.5 rounded transition-all text-amber-500/30 hover:text-amber-400 hover:bg-amber-500/10"
                            title="Environment Secrets"
                        >
                            <Lock className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!activeFileId || !unsavedChanges[activeFileId]}
                            className={cn("p-1.5 rounded transition-all flex items-center gap-1.5 text-xs font-medium", unsavedChanges[activeFileId || ""] ? "text-emerald-400 hover:bg-emerald-500/10" : "text-white/20 opacity-50")}
                        >
                            <Save className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleRunProject}
                            className="p-1.5 rounded hover:bg-emerald-500/15 text-emerald-400/70 hover:text-emerald-400 disabled:opacity-30 transition-all"
                            title="Run (Preview)"
                            disabled={isInstalling || !webContainerBooted}
                        >
                            {isInstalling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </button>
                    </div>
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
                                    </div>
                                </div>
                            )
                        ) : (
                            /* Empty State: Show Project Templates when no file is open */
                            <ProjectTemplates
                                onSelectTemplate={async (templateFiles) => {
                                    // Create files from template via API
                                    for (const tf of templateFiles) {
                                        try {
                                            const res = await fetch("/api/files/create", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ name: tf.name, content: tf.content })
                                            });
                                            if (res.ok) {
                                                const newFile = await res.json();
                                                setFiles(prev => [...prev, newFile]);
                                                setFileContents(prev => ({ ...prev, [newFile.id]: newFile.content || tf.content }));
                                                // Auto-open the first file
                                                if (templateFiles.indexOf(tf) === 0) {
                                                    setOpenFiles(prev => [...prev, newFile.id]);
                                                    setActiveFileId(newFile.id);
                                                }
                                            }
                                        } catch (e) {
                                            console.error("Failed to create template file:", tf.name, e);
                                        }
                                    }
                                    toast(`Created ${templateFiles.length} files from template`, "success");
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
                    <div className={cn("flex-none border-t border-white/[0.06] bg-[#020010] flex flex-col shadow-[0_-4px_30px_rgba(0,0,0,0.5)] z-20", terminalMaximized ? "h-[60vh]" : "h-32")}>
                        {/* Terminal Header */}
                        <div className="flex-none h-8 flex items-center justify-between px-3 border-b border-white/[0.04] select-none bg-[#030014]">
                            <div className="flex items-center gap-4 h-full">
                                <button className="h-full text-[11px] font-medium text-white/80 flex items-center gap-1.5 px-2 relative">
                                    <TerminalIcon className="w-3.5 h-3.5 text-purple-400/60" />
                                    Terminal
                                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 to-violet-400" />
                                </button>
                                <button className="h-full text-[11px] font-medium text-white/25 hover:text-white/50 flex items-center gap-1.5 px-2 transition-colors">
                                    Output
                                </button>
                                <button className="h-full text-[11px] font-medium text-white/25 hover:text-white/50 flex items-center gap-1.5 px-2 transition-colors">
                                    Problems
                                    <span className="bg-purple-500/15 text-purple-300/60 px-1 rounded-full text-[9px] font-bold">0</span>
                                </button>
                                <button className="h-full text-[11px] font-medium text-white/25 hover:text-white/50 flex items-center gap-1.5 px-2 transition-colors">
                                    Debug Console
                                </button>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors" title="Split">
                                    <SplitSquareHorizontal className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => {
                                        if (terminalInstance) {
                                            terminalInstance.clear();
                                            toast('Terminal cleared', 'success');
                                        }
                                    }}
                                    className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors"
                                    title="Clear Terminal"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <div className="w-px h-3 bg-white/[0.06] mx-1" />
                                <button
                                    onClick={() => setTerminalMaximized(!terminalMaximized)}
                                    className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors"
                                    title={terminalMaximized ? 'Restore' : 'Maximize'}
                                >
                                    {terminalMaximized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                    onClick={() => setShowTerminal(false)}
                                    className="p-1 rounded hover:bg-red-500/10 text-white/25 hover:text-red-400 transition-colors"
                                    title="Close"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Terminal Content */}
                        <div className="flex-1 min-h-0 bg-[#020010] p-1 pl-3 overflow-hidden">
                            <Terminal
                                onTerminalReady={async (term) => {
                                    setTerminalInstance(term);
                                    term.writeln("\x1b[1;32m➜\x1b[0m \x1b[1;36mdocumint-project\x1b[0m");

                                    // Connect shell
                                    if (webContainerBooted) {
                                        const wc = await WebContainerManager.getInstance();
                                        const shellProcess = await wc.spawn('jsh', {
                                            terminal: {
                                                cols: term.cols,
                                                rows: term.rows,
                                            },
                                        });

                                        shellProcess.output.pipeTo(new WritableStream({
                                            write(data) {
                                                term.write(data);
                                            }
                                        }));

                                        const input = term.onData((data) => {
                                            (shellProcess.input as any).write(data);
                                        });

                                        return () => {
                                            input.dispose();
                                            shellProcess.kill();
                                        };
                                    } else {
                                        term.writeln("\x1b[2mInitializing WebContainer runtime...\x1b[0m");
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Live Preview Panel — powered by WebContainer dev server */}
            {isPreviewOpen && (
                <div className="w-[400px] flex-none h-full min-h-0 z-40">
                    <LivePreview
                        url={previewUrl || undefined}
                        isLoading={isInstalling}
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
                                setFileContents(prev => ({ ...prev, [activeFileId]: code }));
                                setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
                                toast("Code applied to file", "success");
                            }
                        }}
                        onInsertCodeAtCursor={(code) => {
                            if (editorRef.current) {
                                editorRef.current.insertCodeAtCursor(code);
                                if (activeFileId) {
                                    setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
                                }
                                toast("Code inserted at cursor", "success");
                            }
                        }}
                        onReplaceFileContent={(code, markUnsaved = true) => {
                            if (activeFileId && editorRef.current) {
                                // Use editor method to preserve undo stack
                                editorRef.current.replaceContent(code);

                                // State update will happen via onChange callback from editor
                                if (markUnsaved) {
                                    setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
                                }
                                toast("Code applied successfully", "success");
                            } else if (activeFileId) {
                                // Fallback if editor ref not available (e.g. not focused)
                                setFileContents(prev => ({ ...prev, [activeFileId]: code }));
                                if (markUnsaved) {
                                    setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
                                }
                                toast("Code applied (undo stack reset)");
                            }
                        }}
                        onCreateFile={async (name, content) => {
                            try {
                                const res = await fetch("/api/files/create", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name, content })
                                });

                                if (res.ok) {
                                    const newFile = await res.json();
                                    toast(`File ${name} created`, "success");

                                    // Dynamic state update without reload
                                    setFiles(prev => [...prev, newFile]);
                                    setFileContents(prev => ({ ...prev, [newFile.id]: content || "" }));
                                    setOpenFiles(prev => [...prev, newFile.id]);
                                    setActiveFileId(newFile.id);
                                } else {
                                    toast("Failed to create file", "error");
                                }
                            } catch (e) {
                                toast("Error creating file", "error");
                            }
                        }}
                        onSelectFile={setActiveFileId}
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

            <CommandPalette open={isCommandPaletteOpen} onOpenChange={setIsCommandPaletteOpen} />
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
