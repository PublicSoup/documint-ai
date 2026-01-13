"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileTree } from "./file-tree";
import { SimpleEnhancedEditor, SimpleEnhancedEditorRef } from "./simple-enhanced-editor";
import { X, Save, Play, Bot, Layout, Maximize2, Columns, Terminal, Settings, Search, Sparkles } from "lucide-react";
import { File } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "../toast";
import { Button } from "../ui/button";
import { AIChatPanel } from "./ai-chat-panel";
import { EnhancedFileTree } from "./enhanced-file-tree";

interface EnhancedIDELayoutProps {
    files: (File & { content?: string | null })[];
    user: any;
}

export default function EnhancedIDELayout({ files: initialFiles, user }: EnhancedIDELayoutProps) {
    const { toast } = useToast();
    const [activeFileId, setActiveFileId] = useState<string | undefined>(initialFiles[0]?.id);
    const [openFiles, setOpenFiles] = useState<string[]>(initialFiles.length > 0 ? [initialFiles[0].id] : []);
    const [fileContents, setFileContents] = useState<Record<string, string>>({});
    const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Layout State
    const [showSidebar, setShowSidebar] = useState(true);
    const [showAIChat, setShowAIChat] = useState(true);
    const [showAIEditor, setShowAIEditor] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);
    const editorRef = useRef<SimpleEnhancedEditorRef>(null);

    // Initial load of content (simulation, in real app we fetch content on demand)
    useEffect(() => {
        // Hypothetically fetch content
    }, []);

    const handleFileSelect = async (fileId: string) => {
        if (!openFiles.includes(fileId)) {
            setOpenFiles([...openFiles, fileId]);
        }
        setActiveFileId(fileId);

        // If content not loaded, fetch it (mock for now)
        if (!fileContents[fileId]) {
            try {
                const res = await fetch(`/api/files/${fileId}/raw`);
                const data = await res.json();
                if (data.content) {
                    setFileContents(prev => ({ ...prev, [fileId]: data.content }));
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
        const fileName = prompt("Enter file name (e.g., myFile.ts):");
        if (!fileName) return;

        try {
            const res = await fetch("/api/files/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: fileName })
            });

            if (res.ok) {
                const newFile = await res.json();
                toast("File created successfully", "success");
                // In a real app, we'd update the file list instead of reloading
                setTimeout(() => window.location.reload(), 1000);
            } else {
                const text = await res.text();
                toast(text || "Failed to create file", "error");
            }
        } catch (e) {
            toast("Failed to create file", "error");
        }
    };

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

    const activeFile = initialFiles.find(f => f.id === activeFileId);

    const handleAction = async (action: "ai" | "delete" | "rename" | "new_file" | "new_folder" | "refresh", fileId?: string) => {
        if (action === "new_file") {
            await handleCreateFile();
        } else if (action === "new_folder") {
            // Handle folder creation
            toast("Folder creation not implemented yet", "success");
        } else if (action === "refresh") {
            // Handle refresh
            window.location.reload();
        } else if (action === "ai" && fileId) {
            setActiveFileId(fileId);
            setShowAIChat(true);
            if (!openFiles.includes(fileId)) {
                setOpenFiles([...openFiles, fileId]);
            }
        } else if (action === "delete" && fileId) {
            if (confirm("Are you sure you want to delete this file?")) {
                try {
                    await fetch(`/api/files/${fileId}/raw`, { method: "DELETE" });
                    toast("File deleted", "success");
                    // Refresh or redirect (In real app, we'd invalidate router cache)
                    setTimeout(() => window.location.reload(), 1000);
                } catch (e) {
                    toast("Failed to delete", "error");
                }
            }
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#1e1e1e] text-white">
            {/* Left Sidebar */}
            {showSidebar && (
                <div className="w-64 shrink-0 flex flex-col border-r border-white/5 bg-[#1e1e1e]">
                    <EnhancedFileTree
                        files={initialFiles}
                        activeFileId={activeFileId}
                        onSelect={handleFileSelect}
                        onAction={handleAction}
                        onRefresh={() => window.location.reload()}
                    />
                </div>
            )}

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
                {/* Tabs & Toolbar */}
                <div className="flex items-center justify-between h-10 bg-[#1e1e1e] border-b border-white/5 select-none">
                    <div className="flex items-center h-full overflow-x-auto custom-scrollbar">
                        {openFiles.map(fileId => {
                            const file = initialFiles.find(f => f.id === fileId);
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
                        <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground" title="Toggle Sidebar">
                            <Columns className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowAIChat(!showAIChat)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground" title="Toggle AI Chat">
                            <Bot className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowTerminal(!showTerminal)} className="p-1.5 rounded hover:bg-white/10 text-muted-foreground" title="Toggle Terminal">
                            <Terminal className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setShowAIEditor(!showAIEditor)}
                            className="p-1.5 rounded hover:bg-purple-500/20 text-purple-500 hover:text-purple-400"
                            title="Toggle AI Editor"
                        >
                            <Bot className="w-4 h-4" />
                        </button>

                        {/* AI Agent Button - Code Editor Mode */}
                        {showAIEditor && (
                            <button
                                onClick={async () => {
                                    // AI agent functionality - this will connect to /api/chat
                                    const currentContent = activeFileId ? fileContents[activeFileId] : "";
                                    if (currentContent) {
                                        try {
                                            // Send current code to AI for analysis/editing
                                            const res = await fetch("/api/chat", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    message: `Please analyze and improve this code:\n\n${currentContent}`,
                                                    contextFileId: activeFileId,
                                                    contextContent: currentContent
                                                })
                                            });

                                            const data = await res.json();
                                            if (data.reply) {
                                                toast("AI analysis complete", "success");
                                                // Optional: Update editor content with AI suggestions
                                                // setFileContents(prev => ({ ...prev, [activeFileId]: data.reply }));
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
                        <button className="p-1.5 rounded hover:bg-green-500/20 text-green-500 hover:text-green-400" title="Run (Preview)">
                            <Play className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Editor Area */}
                <div className="flex-1 relative">
                    {activeFileId && activeFile ? (
                        <SimpleEnhancedEditor
                            ref={editorRef}
                            code={fileContents[activeFileId] || "// Loading content..."}
                            language={activeFile.language === 'ts' || activeFile.language === 'tsx' ? 'typescript' : activeFile.language === 'js' ? 'javascript' : activeFile.language}
                            fileName={activeFile.name}
                            onChange={handleContentChange}
                            onSave={handleSave}
                            onRun={() => toast("Run functionality not implemented yet", "success")}
                        />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                            <Layout className="w-16 h-16 opacity-20" />
                            <p className="text-sm">Select a file to start editing</p>
                            <div className="flex gap-2 text-xs">
                                <span className="bg-white/5 px-2 py-1 rounded">Cmd+P to Search</span>
                                <span className="bg-white/5 px-2 py-1 rounded">Cmd+S to Save</span>
                                <span className="bg-white/5 px-2 py-1 rounded">Cmd+` to Terminal</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Terminal Panel */}
                {showTerminal && (
                    <div className="h-48 border-t border-white/5 bg-black">
                        <div className="flex items-center justify-between h-8 bg-[#007acc] px-3">
                            <span className="text-xs font-medium">Terminal</span>
                            <button
                                onClick={() => setShowTerminal(false)}
                                className="text-white/70 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-3 font-mono text-xs text-green-400">
                            <div>$ Welcome to DocuMint IDE Terminal</div>
                            <div>$ Ready for commands...</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Sidebar (AI) */}
            {showAIChat && (
                <div className="w-96 shrink-0 border-l border-white/5 bg-[#1a1a1a] flex flex-col">
                    <AIChatPanel
                        activeFileId={activeFileId}
                        activeFileContent={activeFileId ? fileContents[activeFileId] : undefined}
                        activeFileName={activeFile ? activeFile.name : undefined}
                        allFiles={initialFiles.map(f => ({ id: f.id, name: f.name, language: f.language }))}
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
                                    body: JSON.stringify({ name, content }) // content optional in API but useful if supported
                                });

                                if (res.ok) {
                                    const newFile = await res.json();
                                    toast(`File ${name} created`, "success");

                                    // Refresh logic or update state (mock update for now)
                                    // In real app, we might need to reload or update ‘initialFiles’ if not managed by global state
                                    // For now, let's just trigger a reload to see the new file
                                    setTimeout(() => window.location.reload(), 500);
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
