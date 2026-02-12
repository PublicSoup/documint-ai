"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { SimpleEnhancedEditor, SimpleEnhancedEditorRef } from "./simple-enhanced-editor";
import { X, Save, Play, Bot, Layout, Maximize2, Columns, Terminal as TerminalIcon, Settings, Sparkles, GitBranch, Files, Search as SearchIcon, Globe, Loader2, Lock, FileText, Share2, Wand2, Zap, Layout as LayoutIcon, SplitSquareVertical } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { File } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "../toast";
import { Button } from "../ui/button";
import { AIChatPanel } from "./ai-chat-panel";
import { EnhancedFileTree } from "./enhanced-file-tree";
import { WebContainerManager } from "@/lib/web-container";
import { Terminal } from "./terminal";
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
import { DiagramViewer } from "../diagram-viewer";
import { getProjectGraphMermaid } from "@/app/dashboard/actions";

// Auto-detect Monaco language from file name
function getLanguageFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
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

    // Layout State
    const [showSidebar, setShowSidebar] = useState(true);
    const [activeSidebarTab, setActiveSidebarTab] = useState<"explorer" | "search" | "git">("explorer");
    const [showAIChat, setShowAIChat] = useState(true);
    const [showAIEditor, setShowAIEditor] = useState(false);
    const [showTerminal, setShowTerminal] = useState(true);
    const [showDocPreview, setShowDocPreview] = useState(false);
    const [showLocalTopology, setShowLocalTopology] = useState(false);
    const [localMermaid, setLocalMermaid] = useState<string>("");
    const editorRef = useRef<SimpleEnhancedEditorRef>(null);
    const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);

    // Handle query parameter for auto-opening files
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
                files.forEach(f => {
                    fileMounts[f.name] = { file: { contents: f.content || "" } };
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
                        setShowSidebar(prev => !prev);
                        break;
                    case 'i':
                        e.preventDefault();
                        setShowAIChat(prev => !prev);
                        break;
                    case '`':
                        e.preventDefault();
                        setShowTerminal(prev => !prev);
                        break;
                }
            } else if (isCmd && e.key.toLowerCase() === 's' && isEditing) {
                // Allow Cmd+S to save even when in editor
                e.preventDefault();
                handleSave();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeFileId, fileContents, unsavedChanges]);

    const activeFile = files.find(f => f.id === activeFileId);



    const handleAction = async (action: "ai" | "delete" | "rename" | "new_file" | "new_folder" | "refresh", fileId?: string) => {
        if (action === "new_file") {
            await handleCreateFile();
        } else if (action === "new_folder") {
            toast("Folder creation not implemented yet", "success");
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
                const res = await fetch(`/api/files/${fileId}/raw`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: newName })
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
        <div className="flex h-screen w-screen overflow-hidden bg-[#1e1e1e] text-white fixed inset-0 z-[100] selection:bg-primary/30">
            {/* Activity Bar */}
            <div className="w-12 flex-none flex flex-col items-center py-4 gap-4 border-r border-white/5 bg-[#18181b] z-40 h-full overflow-hidden">
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
                        "p-2 rounded-lg transition-all",
                        showSidebar && activeSidebarTab === "explorer" ? "bg-primary/20 text-primary shadow-glow" : "text-white/40 hover:text-white/70"
                    )}
                    title="Explorer"
                >
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
                        "p-2 rounded-lg transition-all",
                        showSidebar && activeSidebarTab === "search" ? "bg-primary/20 text-primary shadow-glow" : "text-white/40 hover:text-white/70"
                    )}
                    title="Search"
                >
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
                        "p-2 rounded-lg transition-all",
                        showSidebar && activeSidebarTab === "git" ? "bg-primary/20 text-primary shadow-glow" : "text-white/40 hover:text-white/70"
                    )}
                    title="Source Control"
                >
                    <GitBranch className="w-5 h-5" />
                </button>
                <div className="mt-auto flex flex-col gap-4">
                    <button className="p-2 text-white/40 hover:text-white/70 transition-colors" title="Settings">
                        <Settings className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Left Sidebar Content */}
            {showSidebar && (
                <div className="w-56 md:w-64 flex-none flex flex-col border-r border-white/5 bg-[#1e1e1e] h-full overflow-hidden animate-in slide-in-from-left-1 duration-200 z-30">
                    {activeSidebarTab === "explorer" && (
                        <EnhancedFileTree
                            files={files}
                            activeFileId={activeFileId}
                            onSelect={handleFileSelect}
                            onAction={handleAction}
                            onRefresh={() => window.location.reload()}
                        />
                    )}
                    {activeSidebarTab === "search" && (
                        <div className="flex flex-col h-full">
                            <div className="p-4 border-b border-white/5">
                                <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Search</h2>
                                <div className="relative">
                                    <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                    <input
                                        placeholder="Search in project..."
                                        className="w-full bg-black/20 border border-white/5 rounded-md pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50"
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
            )}

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 max-w-full bg-[#1e1e1e] relative z-10 h-full overflow-hidden">
                {/* Enterprise Header */}
                <ContextualHeader
                    filePath={activeFile?.name || "No file selected"}
                    riskScore={activeFile?.id ? 45 : 0} // Would ideally come from a computed state
                    isSaving={isSaving}
                />

                {/* Tabs & Toolbar */}
                <div className="flex-none flex items-center justify-between h-10 bg-[#1e1e1e] border-b border-white/5 select-none overflow-hidden">
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
                                        "h-full px-3 flex items-center gap-2 text-xs border-r border-white/5 cursor-pointer transition-colors min-w-[100px] max-w-[200px] group",
                                        isActive ? "bg-[#1e1e1e] text-white border-t-2 border-t-primary" : "bg-[#2d2d2d] text-muted-foreground hover:bg-[#252525] border-t-2 border-t-transparent"
                                    )}
                                >
                                    <span className="truncate">{file.name}</span>
                                    {isUnsaved && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
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

                    <div className="flex items-center gap-1 px-2 h-full bg-[#1e1e1e]">
                        <button onClick={(e) => {
                            e.stopPropagation();
                            if (clickTimeout) return;
                            const timeout = setTimeout(() => setClickTimeout(null), 300);
                            setClickTimeout(timeout);
                            setShowSidebar(!showSidebar);
                        }} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground" title="Toggle Sidebar">
                            <Columns className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            if (clickTimeout) return;
                            const timeout = setTimeout(() => setClickTimeout(null), 300);
                            setClickTimeout(timeout);
                            setShowAIChat(!showAIChat);
                        }} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground" title="Toggle AI Chat">
                            <Bot className="w-4 h-4" />
                        </button>
                        <button onClick={(e) => {
                            e.stopPropagation();
                            if (clickTimeout) return;
                            const timeout = setTimeout(() => setClickTimeout(null), 300);
                            setClickTimeout(timeout);
                            setShowTerminal(!showTerminal);
                        }} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground" title="Toggle Terminal">
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
                            className={cn("p-1.5 rounded transition-colors", showAIEditor ? "bg-purple-500/20 text-purple-400" : "text-purple-500 hover:bg-purple-500/10")}
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
                            className={cn("p-1.5 rounded transition-colors", showDocPreview ? "bg-blue-500/20 text-blue-400" : "text-blue-500 hover:bg-blue-500/10")}
                            title="Toggle Doc Preview"
                        >
                            <FileText className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => setShowLocalTopology(!showLocalTopology)}
                            className={cn("p-1.5 rounded transition-colors", showLocalTopology ? "bg-emerald-500/20 text-emerald-400" : "text-emerald-500 hover:bg-emerald-500/10")}
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
                        <div className="w-px h-4 bg-white/10 mx-1" />
                        <button
                            onClick={handleSave}
                            disabled={!activeFileId || !unsavedChanges[activeFileId]}
                            className={cn("p-1.5 rounded transition-colors flex items-center gap-1.5 text-xs font-medium", unsavedChanges[activeFileId || ""] ? "text-primary hover:bg-primary/10" : "text-muted-foreground opacity-50")}
                        >
                            <Save className="w-4 h-4" />
                        </button>
                        <button
                            onClick={async () => {
                                if (!webContainerBooted || !terminalInstance) {
                                    toast("runtime not ready", "error");
                                    return;
                                }

                                setIsInstalling(true);
                                setShowTerminal(true);

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
                            }}
                            className="p-1.5 rounded hover:bg-green-500/20 text-green-500 hover:text-green-400 disabled:opacity-50"
                            title="Run (Preview)"
                            disabled={isInstalling || !webContainerBooted}
                        >
                            {isInstalling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Editor Area */}
                <div className="flex-1 relative min-h-0 overflow-hidden flex">
                    <div className={cn("flex-1 min-w-0 relative h-full transition-all duration-300 ease-in-out", (showDocPreview || showLocalTopology) && "border-r border-white/10")}>
                        {/* Surgical AI HUD */}
                        {activeFile && (
                            <div className="absolute top-4 right-4 flex items-center gap-1 bg-[#1e1e1e]/90 backdrop-blur-xl border border-white/10 p-1 rounded-xl shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-500">
                                <button className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-all flex items-center gap-2 px-3">
                                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Speed Fix</span>
                                </button>
                                <div className="w-px h-3 bg-white/10 mx-1" />
                                <button className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-all flex items-center gap-2 px-3">
                                    <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Refactor</span>
                                </button>
                            </div>
                        )}

                        {activeFileId && activeFile ? (
                            <SimpleEnhancedEditor
                                ref={editorRef}
                                code={fileContents[activeFileId] ?? ""}
                                language={getLanguageFromFileName(activeFile.name)}
                                fileName={activeFile.name}
                                onChange={handleContentChange}
                                onSave={handleSave}
                                onRun={() => toast("Run functionality not implemented yet", "success")}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 bg-zinc-900/20">
                                <div className="relative">
                                    <Layout className="w-16 h-16 opacity-10" />
                                    <Sparkles className="w-6 h-6 absolute -top-2 -right-2 text-primary opacity-20 animate-pulse" />
                                </div>
                                <p className="text-xs font-medium tracking-widest uppercase opacity-30">DocuMint Agentic IDE</p>
                                <div className="flex flex-col gap-2 items-center">
                                    <div className="flex gap-2 text-[10px] font-mono text-white/20">
                                        <kbd className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">⌘ P</kbd>
                                        <span>Quick Open</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] font-mono text-white/20">
                                        <kbd className="bg-white/5 px-1.5 py-0.5 rounded border border-white/10">⌘ /</kbd>
                                        <span>AI Assistant</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {showDocPreview && activeFile && (
                        <div className="w-[40%] max-w-[800px] min-w-[350px] bg-[#0c0c0e] overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-500 border-l border-white/5 shadow-2xl z-20">
                            <div className="p-3 border-b border-white/10 bg-[#161618] flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
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
                                    <button className="p-1.5 rounded hover:bg-white/5 text-white/40" title="Refresh">
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
                        <div className="w-[40%] max-w-[800px] min-w-[350px] bg-[#0c0c0e] overflow-hidden flex flex-col animate-in slide-in-from-right duration-500 border-l border-white/5 shadow-2xl z-20">
                            <div className="p-3 border-b border-white/10 bg-[#161618] flex items-center justify-between sticky top-0 z-20 backdrop-blur-md">
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
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none z-10" />
                                <DiagramViewer code={localMermaid} type="flowchart" onNodeClick={handleFileSelect} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Bar */}
                <IDEStatusBar
                    fileCount={files.length}
                    maxFiles={subscription?.limits?.totalFiles || 25}
                    tokensUsed={4500}
                    maxTokens={10000}
                    plan={subscription?.plan || "Free"}
                    isSaving={isSaving}
                    activeFile={activeFile?.name}
                />



                {/* Terminal Panel */}
                {showTerminal && (
                    <div className="flex-none h-48 border-t border-white/5 bg-black overflow-hidden flex flex-col">
                        <div className="flex-none flex items-center justify-between h-8 bg-[#007acc] px-3">
                            <span className="text-xs font-medium">Terminal</span>
                            <button
                                onClick={() => setShowTerminal(false)}
                                className="text-white/70 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 h-full min-h-0 bg-black">
                            <Terminal
                                onTerminalReady={async (term) => {
                                    setTerminalInstance(term);
                                    term.writeln("Welcome to DocuMint Web Shell");

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
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Preview Panel */}
            {isPreviewOpen && previewUrl && (
                <div className="w-[400px] flex-none border-l border-white/5 bg-white flex flex-col h-full min-h-0 z-40">
                    <div className="h-8 bg-[#f5f5f5] border-b flex items-center justify-between px-2">
                        <span className="text-xs text-black font-mono truncate max-w-[200px]">{previewUrl}</span>
                        <div className="flex gap-2">
                            <button onClick={() => window.open(previewUrl, '_blank')} className="text-zinc-500 hover:text-black">
                                <Globe className="w-3 h-3" />
                            </button>
                            <button onClick={() => setIsPreviewOpen(false)} className="text-zinc-500 hover:text-red-500">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                    <iframe src={previewUrl} className="flex-1 w-full border-none bg-white" title="Preview" />
                </div>
            )}

            {/* Right Sidebar (AI) */}
            {showAIChat && (
                <div className="w-[300px] md:w-[350px] flex-none border-l border-white/5 bg-[#1a1a1a] flex flex-col h-full min-h-0 overflow-hidden z-30 relative">
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
                    />
                </div>
            )}
        </div>
    );
}
