"use client";
import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";

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
        };

        if (loading) {
            return (
                <div className="h-full w-full bg-[#1e1e1e] flex flex-col items-center justify-center text-muted-foreground animate-in fade-in duration-500">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                        <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping opacity-20" />
                    </div>
                    <p className="mt-4 text-xs font-medium tracking-widest uppercase opacity-40">Loading Source...</p>

                    {/* Simulated skeleton lines */}
                    <div className="mt-8 w-64 space-y-3 opacity-10">
                        <div className="h-2 bg-white rounded w-full" />
                        <div className="h-2 bg-white rounded w-3/4" />
                        <div className="h-2 bg-white rounded w-5/6" />
                        <div className="h-2 bg-white rounded w-1/2" />
                    </div>
                </div>
            );
        }

        if (originalCode) {
            return (
                <div className="h-full w-full bg-[#1e1e1e] overflow-hidden rounded-xl border border-white/5 shadow-2xl relative">
                    <div className="absolute top-0 left-0 right-0 h-6 bg-[#2d2d2d] z-10 flex items-center justify-center text-[10px] text-muted-foreground border-b border-black">
                        <span className="w-1/2 text-center border-r border-black">Original</span>
                        <span className="w-1/2 text-center text-green-500 font-medium">Proposed Change</span>
                    </div>
                    <div className="h-full pt-6">
                        <DiffEditor
                            height="100%"
                            language={language}
                            original={originalCode}
                            modified={code}
                            theme="vs-dark"
                            options={{
                                ...commonOptions,
                                renderSideBySide: true,
                                readOnly: true, // Diff view is typically read-only for review
                            }}
                            loading={
                                <div className="flex items-center justify-center h-full text-muted-foreground bg-[#1e1e1e]">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    Comparing changes...
                                </div>
                            }
                        />
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full w-full bg-[#1e1e1e] overflow-hidden rounded-xl border border-white/5 shadow-2xl">
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
                        <div className="flex items-center justify-center h-full text-muted-foreground bg-[#1e1e1e]">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            Initializing Editor...
                        </div>
                    }
                />
            </div>
        );
    }
);

EditorTerminal.displayName = "EditorTerminal";
