"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
    X, Save, Play, Bot, Layout, Maximize2, Columns, Eye, Check,
    Sparkles, Search as SearchIcon, FilePlus2, Plus, FileCode2, Terminal,
    User as UserIcon, Send, FileIcon, MessageSquare, History, Settings,
    Bot as BotIcon, ClipboardList, Lightbulb, ChevronRight, ChevronDown,
    Command, FileText, Database, Copy
} from "lucide-react";
import { FileTree } from "./ide/file-tree";
import { EditorTerminal } from "./ide/editor-terminal";
import { File } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "./toast";
import { Button } from "./ui/button";
import { AIChatPanel } from "./ide/ai-chat-panel";
import { CommandPalette } from "./ide/command-palette";
import { SubscriptionInfo } from "@/lib/subscription";
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel
} from "./ui/dropdown-menu";

interface IDELayoutProps {
    files: (File & { content?: string | null })[];
    user: any;
    subscription?: SubscriptionInfo;
}

export default function IDELayout({ files: initialFiles, user, subscription }: IDELayoutProps) {
    const { toast } = useToast();
    const [files, setFiles] = useState<(File & { content?: string | null })[]>(initialFiles);
    const [activeFileId, setActiveFileId] = useState<string | undefined>(initialFiles[0]?.id);
    const [openFiles, setOpenFiles] = useState<string[]>(initialFiles.length > 0 ? [initialFiles[0].id] : []);
    const [fileContents, setFileContents] = useState<Record<string, string>>({});
    const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingContent, setIsLoadingContent] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Diff State
    const [diffState, setDiffState] = useState<{ original: string; modified: string; } | null>(null);

    // Layout State
    const [showSidebar, setShowSidebar] = useState(true);
    const [showAIChat, setShowAIChat] = useState(true);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [showInlinePrompt, setShowInlinePrompt] = useState(false);
    const [agentActivity, setAgentActivity] = useState<string | null>(null);
    const [pendingAIChatInput, setPendingAIChatInput] = useState<string | undefined>(undefined);
    const editorRef = useRef<any>(null);

    // Lifecycle Management
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const handleFileSelect = async (fileId: string) => {
        if (!openFiles.includes(fileId)) {
            setOpenFiles(prev => [...prev, fileId]);
        }
        setActiveFileId(fileId);
        setDiffState(null);

        if (!fileContents[fileId]) {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            const controller = new AbortController();
            abortControllerRef.current = controller;

            setIsLoadingContent(true);
            try {
                const res = await fetch(`/api/files/${fileId}/raw`, {
                    signal: controller.signal
                });

                if (res.status === 402) {
                    toast("Upgrade to Pro to view code", "error");
                    setIsLoadingContent(false);
                    return;
                }

                if (!res.ok) throw new Error("Failed to fetch");

                const data = await res.json();
                if (data.content !== undefined && data.content !== null) {
                    setFileContents(prev => ({ ...prev, [fileId]: data.content }));
                }
            } catch (e: any) {
                if (e.name !== 'AbortError') {
                    console.error("File load error:", e);
                    toast("Failed to load file content", "error");
                }
            } finally {
                if (abortControllerRef.current === controller) {
                    setIsLoadingContent(false);
                }
            }
        } else {
            setIsLoadingContent(false);
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

    const handleCreateFile = async (name?: string, content?: string) => {
        let fileName = name;
        if (!fileName) {
            const input = prompt("Enter file name (e.g., myFile.ts):");
            if (input) fileName = input;
        }
        if (!fileName) return;

        try {
            const res = await fetch("/api/files/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: fileName, content: content || "" })
            });

            if (res.ok) {
                const newFile = await res.json();
                toast("File created successfully", "success");
                setFiles(prev => [...prev, newFile]);
                setActiveFileId(newFile.id);
                setOpenFiles(prev => [...prev, newFile.id]);
                if (content) {
                    setFileContents(prev => ({ ...prev, [newFile.id]: content }));
                }
            } else {
                const text = await res.text();
                toast(text || "Failed to create file", "error");
            }
        } catch (e: any) {
            toast(`Failed to create file: ${e.message}`, "error");
        }
    };

    const handleAction = async (action: "ai" | "delete" | "rename" | "new_file", fileId?: string) => {
        if (action === "new_file") {
            await handleCreateFile();
        } else if (action === "ai" && fileId) {
            setActiveFileId(fileId);
            setShowAIChat(true);
            if (!openFiles.includes(fileId)) {
                setOpenFiles(prev => [...prev, fileId]);
            }
        } else if (action === "delete" && fileId) {
            if (confirm("Are you sure you want to delete this file?")) {
                try {
                    await fetch(`/api/files/${fileId}/raw`, { method: "DELETE" });
                    toast("File deleted", "success");
                    setFiles(prev => prev.filter(f => f.id !== fileId));
                    setOpenFiles(prev => prev.filter(id => id !== fileId));
                    if (activeFileId === fileId) setActiveFileId(undefined);
                } catch (e) {
                    toast("Failed to delete", "error");
                }
            }
        }
    };

    const handleReviewDiff = useCallback((original: string, modified: string) => {
        setDiffState({ original, modified });
    }, []);

    const handleApplyDiff = () => {
        if (!diffState || !activeFileId) return;
        setFileContents(prev => ({ ...prev, [activeFileId]: diffState.modified }));
        setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
        setDiffState(null);
        toast("Changes applied", "success");
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCmd = e.ctrlKey || e.metaKey;
            if (isCmd) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        handleSave();
                        break;
                    case 'b':
                        e.preventDefault();
                        setShowSidebar(prev => !prev);
                        break;
                    case 'p':
                    case 'k':
                        e.preventDefault();
                        setShowCommandPalette(prev => !prev);
                        break;
                    case 'i':
                        e.preventDefault();
                        setShowInlinePrompt(prev => !prev);
                        break;
                }
            }
            if (e.key === 'Escape') {
                setShowCommandPalette(false);
                setShowInlinePrompt(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [activeFileId, fileContents, unsavedChanges]);

    const activeFile = files.find(f => f.id === activeFileId);

    return (
        <div className="flex flex-col h-screen bg-[#0d0d0f] text-gray-300 overflow-hidden selection:bg-primary/30">
            {/* Header / Toolbar */}
            <div className="h-11 border-b border-white/5 bg-[#141416]/80 backdrop-blur-md flex items-center justify-between px-4 z-40 shrink-0">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.href = '/dashboard'}>
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
                            <Bot className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-xs font-black tracking-tight text-white/90 group-hover:text-white transition-colors">DOCUMINT IDE</span>
                    </div>

                    <div className="flex items-center gap-1">
                        <DropdownMenu trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-white/40 hover:text-white/80 transition-colors">File</Button>
                        }>
                            <DropdownMenuItem onClick={() => handleCreateFile()} shortcut="⌘N">
                                <Plus className="w-3.5 h-3.5 mr-2" />
                                New File
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowCommandPalette(true)} shortcut="⌘P">
                                <SearchIcon className="w-3.5 h-3.5 mr-2" />
                                Open File...
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleSave()} shortcut="⌘S" disabled={!activeFileId || !unsavedChanges[activeFileId]}>
                                <Save className="w-3.5 h-3.5 mr-2" />
                                Save
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                                toast("Saving workspace...", "success");
                                // Simulated save all
                            }} shortcut="⌥⌘S">
                                <FileText className="w-3.5 h-3.5 mr-2" />
                                Save All
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => window.location.href = '/dashboard'}>
                                <Layout className="w-3.5 h-3.5 mr-2" />
                                Exit to Dashboard
                            </DropdownMenuItem>
                        </DropdownMenu>

                        <DropdownMenu trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-white/40 hover:text-white/80 transition-colors">Edit</Button>
                        }>
                            <DropdownMenuItem onClick={() => toast("Undo not available in web editor")} shortcut="⌘Z">
                                <History className="w-3.5 h-3.5 mr-2" />
                                Undo
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast("Redo not available in web editor")} shortcut="⇧⌘Z">
                                <History className="w-3.5 h-3.5 mr-2" />
                                Redo
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowInlinePrompt(true)} shortcut="⌘I">
                                <Sparkles className="w-3.5 h-3.5 mr-2 text-primary" />
                                Surgical Edit...
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => document.execCommand('copy')}>
                                <Copy className="w-3.5 h-3.5 mr-2" />
                                Copy
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast("Clipboard access restricted")}>
                                <ClipboardList className="w-3.5 h-3.5 mr-2" />
                                Paste
                            </DropdownMenuItem>
                        </DropdownMenu>

                        <DropdownMenu trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-white/40 hover:text-white/80 transition-colors">Selection</Button>
                        }>
                            <DropdownMenuItem onClick={() => toast("Selecting all...")} shortcut="⌘A">Select All</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast("Expanding selection...")}>Expand Selection</DropdownMenuItem>
                        </DropdownMenu>

                        <DropdownMenu trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-white/40 hover:text-white/80 transition-colors">View</Button>
                        }>
                            <DropdownMenuItem onClick={() => setShowSidebar(!showSidebar)} shortcut="⌘B">
                                {showSidebar ? "Hide Side Bar" : "Show Side Bar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowAIChat(!showAIChat)} shortcut="⌘J">
                                {showAIChat ? "Hide AI Panel" : "Show AI Panel"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => toast("Editor theme: DocuMint Premium")}>Toggle Theme</DropdownMenuItem>
                        </DropdownMenu>

                        <DropdownMenu trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-white/40 hover:text-white/80 transition-colors">Go</Button>
                        }>
                            <DropdownMenuItem onClick={() => setShowCommandPalette(true)}>Go to File...</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast("Navigating to symbol...")}>Go to Symbol...</DropdownMenuItem>
                        </DropdownMenu>

                        <DropdownMenu trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-white/40 hover:text-white/80 transition-colors">Terminal</Button>
                        }>
                            <DropdownMenuItem onClick={() => toast("Opening cloud terminal...", "success")}>New Terminal</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast("Terminal split view")}>Split Terminal</DropdownMenuItem>
                        </DropdownMenu>

                        <DropdownMenu trigger={
                            <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-white/40 hover:text-white/80 transition-colors">Help</Button>
                        }>
                            <DropdownMenuItem onClick={() => toast("Opening Documentation...", "success")}>Documentation</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast("Opening Shortcut Map...")}>Keyboard Shortcuts</DropdownMenuItem>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-white/40 gap-2 hover:bg-white/10 transition-colors group cursor-pointer" onClick={() => setShowCommandPalette(true)}>
                        <SearchIcon className="w-3 h-3 text-white/20 group-hover:text-primary transition-colors" />
                        <span>Search files & commands...</span>
                        <div className="flex gap-0.5 ml-2">
                            <span className="bg-white/10 px-1 rounded border border-white/10">⌘</span>
                            <span className="bg-white/10 px-1 rounded border border-white/10">P</span>
                        </div>
                    </div>

                    {subscription?.isPro && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary animate-pulse shadow-glow shadow-primary/20">
                            <Sparkles className="w-3 h-3" />
                            PRO ACTIVE
                        </div>
                    )}

                    <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-700 to-slate-800 border border-white/10 overflow-hidden hover:scale-105 transition-transform flex items-center justify-center text-[10px] font-bold text-white/50">
                        {user?.name?.[0] || user?.email?.[0] || "U"}
                    </div>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 relative">
                {/* Secondary Sidebar (Activity Bar) */}
                <div className="w-12 border-r border-white/5 bg-[#141416] flex flex-col items-center py-4 gap-6 shrink-0">
                    <div className={cn("p-2 rounded-xl cursor-pointer transition-all", showSidebar ? "bg-primary/20 text-primary shadow-glow shadow-primary/10" : "text-white/20 hover:text-white/50 hover:bg-white/5")} onClick={() => setShowSidebar(!showSidebar)}>
                        <Layout className="w-5 h-5" />
                    </div>
                    <div className={cn("p-2 rounded-xl cursor-pointer transition-all", showAIChat ? "bg-primary/20 text-primary shadow-glow shadow-primary/10" : "text-white/20 hover:text-white/50 hover:bg-white/5")} onClick={() => setShowAIChat(!showAIChat)}>
                        <Bot className="w-5 h-5 hover:scale-110 transition-transform" />
                        {agentActivity && <div className="absolute right-[-2px] bottom-[-2px] w-2 h-2 rounded-full bg-primary shadow-glow shadow-primary/40" />}
                    </div>
                    <div className="p-2 text-white/20 hover:text-white/50 cursor-pointer transition-colors mt-auto">
                        <Terminal className="w-5 h-5" />
                    </div>
                </div>

                {/* Main Sidebar (Files) */}
                {showSidebar && (
                    <div className="w-64 border-r border-white/5 bg-[#18181b] flex flex-col shrink-0 animate-in slide-in-from-left-2 duration-200">
                        <div className="p-3 pb-2 flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Explorer</span>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="w-5 h-5 text-white/40 hover:text-white/80" onClick={() => handleCreateFile()}>
                                    <Plus className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-1">
                            <FileTree
                                files={files}
                                activeFileId={activeFileId}
                                onSelect={handleFileSelect}
                                onAction={handleAction}
                            />
                        </div>
                    </div>
                )}

                {/* Editor Content */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#0d0d0f] relative group/editor">
                    {/* Tabs */}
                    <div className="h-9 flex items-center bg-[#18181b]/50 border-b border-white/5 overflow-x-auto no-scrollbar scroll-smooth">
                        <LayoutGroup>
                            <AnimatePresence>
                                {openFiles.map(id => {
                                    const file = files.find(f => f.id === id);
                                    const isActive = activeFileId === id;
                                    const isChanged = unsavedChanges[id];
                                    return (
                                        <motion.div
                                            layout
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            key={id}
                                            onClick={() => handleFileSelect(id)}
                                            className={cn(
                                                "h-full px-4 flex items-center gap-2 border-r border-white/5 cursor-pointer text-[11px] font-medium transition-colors group/tab flex-shrink-0 relative",
                                                isActive ? "bg-[#1e1e1e] text-white" : "text-white/30 hover:bg-white/5 hover:text-white/60"
                                            )}
                                        >
                                            {isActive && (
                                                <motion.div
                                                    layoutId="activeTab"
                                                    className="absolute top-0 left-0 right-0 h-[2px] bg-primary shadow-glow shadow-primary/20"
                                                />
                                            )}
                                            <FileText className={cn("w-3.5 h-3.5", isActive ? "text-primary/70" : "text-white/20")} />
                                            <span className="truncate max-w-[120px]">{file?.name}</span>
                                            {isChanged ? (
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary/50 group-hover/tab:hidden" />
                                            ) : null}
                                            <button
                                                onClick={(e) => handleCloseFile(e, id)}
                                                className={cn(
                                                    "w-4 h-4 rounded hover:bg-white/10 flex items-center justify-center transition-opacity",
                                                    isActive ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"
                                                )}
                                            >
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </LayoutGroup>
                    </div>

                    {/* Breadcrumbs */}
                    {activeFile && (
                        <div className="h-7 px-4 flex items-center gap-1.5 text-[10px] text-white/30 bg-[#1e1e1e]/20 border-b border-white/5 shrink-0">
                            <span className="hover:text-white/60 cursor-pointer">src</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="hover:text-white/60 cursor-pointer">workspace</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-white/60 font-medium">{activeFile.name}</span>
                        </div>
                    )}

                    {/* Editor / Diff */}
                    <div className="flex-1 min-h-0 relative bg-black/5 flex flex-col items-center justify-center">
                        <div className="absolute inset-0 p-1">
                            {isLoadingContent ? (
                                <div className="h-full w-full bg-[#0d0d0f] rounded-lg border border-white/5 flex flex-col items-center justify-center gap-4">
                                    <div className="relative">
                                        <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                                        <Sparkles className="absolute inset-0 m-auto w-4 h-4 text-primary animate-pulse" />
                                    </div>
                                    <span className="text-[10px] font-black tracking-widest uppercase text-white/20 animate-pulse">Syncing Codebase...</span>
                                </div>
                            ) : activeFileId ? (
                                <EditorTerminal
                                    ref={editorRef}
                                    code={diffState ? diffState.modified : (fileContents[activeFileId] || "")}
                                    originalCode={diffState?.original}
                                    language={((f) => {
                                        if (!f) return "javascript";
                                        const lang = f.language?.toLowerCase();
                                        const ext = f.name.split('.').pop()?.toLowerCase();
                                        if (lang === 'typescript' || lang === 'ts' || lang === 'tsx' || ext === 'ts' || ext === 'tsx') return 'typescript';
                                        if (lang === 'javascript' || lang === 'js' || lang === 'jsx' || ext === 'js' || ext === 'jsx') return 'javascript';
                                        return lang || "plaintext";
                                    })(files.find(f => f.id === activeFileId))}
                                    onChange={handleContentChange}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full gap-6 opacity-40 group-hover/editor:opacity-60 transition-opacity">
                                    <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center shadow-inner">
                                        <Bot className="w-10 h-10 text-white/50" />
                                    </div>
                                    <div className="text-center space-y-2">
                                        <h3 className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">Workspace Standby</h3>
                                        <p className="text-[10px] text-white/20 max-w-[200px]">Prompt the AI or select a module to begin.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-4">
                                        <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg flex items-center gap-2 text-[10px] font-medium text-white/40">
                                            <span className="bg-white/10 px-1 rounded border border-white/10">⌘P</span>
                                            <span>Files</span>
                                        </div>
                                        <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg flex items-center gap-2 text-[10px] font-medium text-white/40">
                                            <span className="bg-white/10 px-1 rounded border border-white/10">⌘I</span>
                                            <span>Quick Fix</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Diff Controls Overlay */}
                        {diffState && !isLoadingContent && (
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-1.5 py-1.5 bg-[#1a1a1c]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-bottom-4">
                                <Button variant="ghost" size="sm" className="h-8 rounded-xl px-3 text-[11px] font-bold text-white/50 hover:text-white" onClick={() => setDiffState(null)}>
                                    Discard
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-8 rounded-xl px-4 text-[11px] font-bold bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20"
                                    onClick={handleApplyDiff}
                                >
                                    <Check className="w-3.5 h-3.5 mr-1.5" />
                                    Accept Surgical Changes
                                </Button>
                            </div>
                        )}

                        {/* Inline Prompt (Cmd+I) */}
                        {showInlinePrompt && (
                            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[540px] z-50 animate-in zoom-in-95 duration-200">
                                <div className="bg-[#1e1e21]/90 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] p-1 overflow-hidden">
                                    <div className="p-3 text-center">
                                        <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Surgical Edit Mode
                                        </div>
                                        <input
                                            autoFocus
                                            placeholder="Update this component to use glassmorphism..."
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all font-medium placeholder:text-white/10 text-center"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const val = (e.target as HTMLInputElement).value;
                                                    if (val) {
                                                        setPendingAIChatInput(val);
                                                        setShowAIChat(true);
                                                        setShowInlinePrompt(false);
                                                        toast("Agent initializing surgical patch...", "success");
                                                    }
                                                }
                                                if (e.key === 'Escape') setShowInlinePrompt(false);
                                            }}
                                        />
                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/20 mt-3 px-1">
                                            <span>ESC TO CANCEL</span>
                                            <span>TARGET: {activeFile?.name || "SOURCE"}</span>
                                            <span>ENTER TO SUBMIT</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar (AI) */}
                {showAIChat && (
                    <div className="w-96 shrink-0 border-l border-white/5 bg-[#141416]/50 backdrop-blur-sm flex flex-col min-h-0 overflow-hidden animate-in slide-in-from-right-2 duration-300">
                        <AIChatPanel
                            activeFileId={activeFileId}
                            activeFileContent={activeFileId ? fileContents[activeFileId] : undefined}
                            activeFileName={activeFile ? activeFile.name : undefined}
                            allFiles={files}
                            allFileContents={fileContents}
                            onReviewDiff={handleReviewDiff}
                            onInsertCodeAtCursor={(code) => {
                                if (editorRef.current) {
                                    editorRef.current.insertCodeAtCursor(code);
                                    toast("Code inserted at cursor", "success");
                                } else {
                                    toast("Select a file first to insert code", "error");
                                }
                            }}
                            onReplaceFileContent={(code, markUnsaved) => {
                                if (activeFileId) {
                                    setFileContents(prev => ({ ...prev, [activeFileId]: code }));
                                    if (markUnsaved) setUnsavedChanges(prev => ({ ...prev, [activeFileId]: true }));
                                }
                            }}
                            onCreateFile={handleCreateFile}
                            onAgentAction={setAgentActivity}
                            initialInput={pendingAIChatInput}
                            onSelectFile={handleFileSelect}
                        />
                    </div>
                )}
            </div>

            {/* Agent Activity Bar (Premium Status Bar) */}
            <div className={cn(
                "h-7 flex items-center px-4 gap-4 select-none z-50 shrink-0 transition-colors duration-500",
                agentActivity ? "bg-primary text-white" : "bg-[#18181b] text-white/40 border-t border-white/5"
            )}>
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        agentActivity ? "bg-white animate-pulse" : "bg-white/10"
                    )} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">
                        {agentActivity ? "Agent Process Active" : "System Standby"}
                    </span>
                </div>

                {agentActivity && (
                    <>
                        <div className="h-3 w-[1px] bg-white/20" />
                        <span className="flex items-center gap-2 truncate max-w-lg text-[10px] font-bold italic animate-in fade-in slide-in-from-left-2">
                            <Bot className="w-3.5 h-3.5" />
                            {agentActivity.toUpperCase()}
                        </span>
                    </>
                )}

                <div className="ml-auto flex items-center gap-4 text-[9px] font-bold">
                    <div className="flex items-center gap-2">
                        <span className="opacity-50 uppercase tracking-widest">Workspace Usage</span>
                        <span className={cn(agentActivity ? "text-white" : "text-primary")}>1.5K TP/S</span>
                    </div>
                    <div className="h-3 w-[1px] bg-white/10" />
                    <div className="flex items-center gap-1.5 opacity-50 uppercase tracking-widest">
                        <Terminal className="w-3 h-3" />
                        LSP: Online
                    </div>
                    <div className="h-3 w-[1px] bg-white/10" />
                    <div className="flex items-center gap-1.5 uppercase tracking-widest">
                        <Sparkles className={cn("w-3 h-3", agentActivity ? "text-white" : "text-primary")} />
                        {subscription?.plan?.toUpperCase() || "FREE"} TIER
                    </div>
                </div>
            </div>

            {/* Global Modals */}
            <CommandPalette
                isOpen={showCommandPalette}
                onClose={() => setShowCommandPalette(false)}
                files={files}
                onSelectFile={handleFileSelect}
            />
        </div>
    );
}
