"use client";
import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Loader2, Plus, X, ChevronUp, ChevronDown, SplitSquareHorizontal, Trash2, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorTerminalProps {
    code: string;
    originalCode?: string; // If present, shows Diff view
    language: string;
    onChange?: (value: string | undefined) => void;
    readOnly?: boolean;
    loading?: boolean;
}

export const EditorTerminal = forwardRef<any, EditorTerminalProps>(
    ({ code, originalCode, language, onChange, readOnly = false, loading = false }, ref) => {
        const editorRef = useRef<any>(null);
        const [activeTab, setActiveTab] = useState<"terminal" | "output" | "debug" | "console">("terminal");
        const [isMaximized, setIsMaximized] = useState(false);

        useImperativeHandle(ref, () => ({
            insertCodeAtCursor: (text: string) => {
                if (editorRef.current) {
                    const selection = editorRef.current.getSelection();
                    const range = new (window as any).monaco.Range(
                        selection.startLineNumber,
                        selection.startColumn,
                        selection.endLineNumber,
                        selection.endColumn
                    );
                    const id = { major: 1, minor: 1 };
                    const textOp = { identifier: id, range: range, text: text, forceMoveMarkers: true };
                    editorRef.current.executeEdits("my-source", [textOp]);
                }
            }
        }));

        const handleEditorDidMount = (editor: any) => {
            editorRef.current = editor;
        };

        const commonOptions = {
            minimap: { enabled: true },
            fontSize: 14,
            lineHeight: 22,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            readOnly,
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            automaticLayout: true,
            cursorBlinking: "smooth" as "smooth",
            cursorSmoothCaretAnimation: "on" as "on",
            theme: "vs-dark",
            roundedSelection: true,
        };

        if (loading) {
            return (
                <div className="h-full w-full bg-[#1e1e1e] flex flex-col items-center justify-center text-muted-foreground animate-in fade-in duration-500">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                        <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping opacity-20" />
                    </div>
                    <p className="mt-4 text-xs font-medium tracking-widest uppercase opacity-40">Loading Source...</p>
                </div>
            );
        }

        if (originalCode) {
            return (
                <div className="h-full w-full bg-[#1e1e1e] overflow-hidden rounded-xl border border-white/5 shadow-2xl relative flex flex-col">
                    <div className="flex-none h-9 bg-[#2d2d2d] border-b border-black flex items-center px-4 justify-between">
                        <div className="flex items-center gap-4 text-[11px] font-medium">
                            <div className="flex items-center gap-2 text-red-400">
                                <div className="w-2 h-2 rounded-full bg-red-500/50" />
                                <span>Original</span>
                            </div>
                            <div className="flex items-center gap-2 text-green-400">
                                <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                <span>Proposed Change</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 w-full bg-[#1e1e1e]">
                        <DiffEditor
                            height="100%"
                            language={language}
                            original={originalCode}
                            modified={code}
                            theme="vs-dark"
                            options={{
                                ...commonOptions,
                                renderSideBySide: true,
                                readOnly: true,
                            }}
                        />
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full w-full bg-[#09090b] overflow-hidden rounded-xl border border-white/5 shadow-2xl flex flex-col">
                {/* Modern Editor/Terminal Header */}
                <div className="flex-none h-10 bg-[#18181b] border-b border-white/5 flex items-center justify-between px-3">
                    <div className="flex items-center gap-1 h-full">
                        <button
                            onClick={() => setActiveTab("terminal")}
                            className={cn(
                                "h-full px-3 text-[11px] font-medium transition-all relative flex items-center gap-2",
                                activeTab === "terminal" ? "text-white" : "text-white/40 hover:text-white/70"
                            )}
                        >
                            <TerminalIcon className="w-3.5 h-3.5" />
                            Terminal
                            {activeTab === "terminal" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                        </button>
                        <button
                            onClick={() => setActiveTab("output")}
                            className={cn(
                                "h-full px-3 text-[11px] font-medium transition-all relative flex items-center gap-2",
                                activeTab === "output" ? "text-white" : "text-white/40 hover:text-white/70"
                            )}
                        >
                            Output
                            {activeTab === "output" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                        </button>
                        <button
                            onClick={() => setActiveTab("debug")}
                            className={cn(
                                "h-full px-3 text-[11px] font-medium transition-all relative flex items-center gap-2",
                                activeTab === "debug" ? "text-white" : "text-white/40 hover:text-white/70"
                            )}
                        >
                            Debug Console
                            {activeTab === "debug" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                        </button>
                    </div>
                    <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors" title="New Terminal">
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors" title="Split Panel">
                            <SplitSquareHorizontal className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors" title="Clear">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-px h-3 bg-white/10 mx-1" />
                        <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                        >
                            {isMaximized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                        <button className="p-1.5 rounded hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 w-full bg-[#09090b] relative">
                    <Editor
                        height="100%"
                        defaultLanguage={language}
                        language={language}
                        value={code}
                        theme="vs-dark"
                        onChange={onChange}
                        onMount={handleEditorDidMount}
                        options={commonOptions}
                        loading={
                            <div className="flex items-center justify-center h-full text-muted-foreground bg-[#09090b]">
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                Initializing Editor...
                            </div>
                        }
                    />
                </div>
            </div>
        );
    }
);

EditorTerminal.displayName = "EditorTerminal";
