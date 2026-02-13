"use client";

import React, { useState, useRef, forwardRef, useImperativeHandle } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { FileCode } from "lucide-react";

interface SimpleEnhancedEditorProps {
    code: string;
    language: string;
    fileName?: string;
    onChange?: (value: string | undefined) => void;
    onSave?: () => void;
    onRun?: () => void;
    onCursorChange?: (line: number, column: number) => void;
    readOnly?: boolean;
    theme?: "vs-dark" | "light" | "hc-black";
}

export interface SimpleEnhancedEditorRef {
    insertCodeAtCursor: (code: string) => void;
    replaceContent: (code: string) => void;
    getContent: () => string;
    focus: () => void;
    setCursorToEnd: () => void;
}

const SimpleEnhancedEditorComponent = ({
    code,
    language,
    fileName,
    onChange,
    onSave,
    onRun,
    onCursorChange,
    readOnly = false,
    theme = "vs-dark"
}: SimpleEnhancedEditorProps, ref: React.Ref<SimpleEnhancedEditorRef>) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);

    // Expose methods to parent components
    useImperativeHandle(ref, () => ({
        insertCodeAtCursor: (code: string) => {
            if (editorRef.current) {
                const editor = editorRef.current;
                const selection = editor.getSelection();
                if (selection) {
                    editor.executeEdits("insert-code", [{
                        range: selection,
                        text: code,
                        forceMoveMarkers: true
                    }]);
                    const lines = code.split('\n');
                    const lastLineLength = lines[lines.length - 1].length;
                    const newPosition = {
                        lineNumber: selection.startLineNumber + lines.length - 1,
                        column: lines.length === 1
                            ? selection.startColumn + lastLineLength
                            : lastLineLength + 1
                    };
                    editor.setPosition(newPosition);
                    editor.focus();
                }
            }
        },
        replaceContent: (newCode: string) => {
            if (editorRef.current) {
                const editor = editorRef.current;
                const model = editor.getModel();
                if (model) {
                    const fullRange = model.getFullModelRange();
                    editor.executeEdits("replace-content", [{
                        range: fullRange,
                        text: newCode,
                        forceMoveMarkers: true
                    }]);
                    const newModel = editor.getModel();
                    if (newModel) {
                        const lastLine = newModel.getLineCount();
                        const lastColumn = newModel.getLineMaxColumn(lastLine);
                        editor.setPosition({ lineNumber: lastLine, column: lastColumn });
                    }
                    editor.focus();
                }
            }
        },
        getContent: () => {
            if (editorRef.current) {
                return editorRef.current.getValue() || "";
            }
            return "";
        },
        focus: () => {
            if (editorRef.current) {
                editorRef.current.focus();
            }
        },
        setCursorToEnd: () => {
            if (editorRef.current) {
                const model = editorRef.current.getModel();
                if (model) {
                    const lastLine = model.getLineCount();
                    const lastColumn = model.getLineMaxColumn(lastLine);
                    editorRef.current.setPosition({ lineNumber: lastLine, column: lastColumn });
                    editorRef.current.focus();
                }
            }
        }
    }));

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Track cursor position and report to parent
        editor.onDidChangeCursorPosition((e: any) => {
            onCursorChange?.(e.position.lineNumber, e.position.column);
        });

        // Define custom DocuMint dark theme
        monaco.editor.defineTheme("documint-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [
                { token: "comment", foreground: "6A737D", fontStyle: "italic" },
                { token: "keyword", foreground: "C792EA" },
                { token: "string", foreground: "C3E88D" },
                { token: "number", foreground: "F78C6C" },
                { token: "type", foreground: "FFCB6B" },
                { token: "function", foreground: "82AAFF" },
                { token: "variable", foreground: "EEFFFF" },
                { token: "operator", foreground: "89DDFF" },
            ],
            colors: {
                "editor.background": "#0d0d11",
                "editor.foreground": "#CBD5E1",
                "editor.lineHighlightBackground": "#ffffff06",
                "editor.selectionBackground": "#7C3AED30",
                "editorCursor.foreground": "#7C3AED",
                "editor.selectionHighlightBackground": "#7C3AED15",
                "editorLineNumber.foreground": "#334155",
                "editorLineNumber.activeForeground": "#7C3AED",
                "editorIndentGuide.background": "#ffffff08",
                "editorIndentGuide.activeBackground": "#7C3AED30",
                "editorBracketMatch.background": "#7C3AED20",
                "editorBracketMatch.border": "#7C3AED50",
                "editor.findMatchBackground": "#FFCB6B30",
                "editor.findMatchHighlightBackground": "#FFCB6B15",
                "editorWidget.background": "#0d0d11",
                "editorWidget.border": "#ffffff10",
                "minimap.background": "#0a0a0e",
            }
        });

        monaco.editor.setTheme("documint-dark");

        // Keybindings
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            onSave?.();
        });
    };

    return (
        <div className="h-full w-full bg-[#0d0d11] overflow-hidden flex flex-col border-0 rounded-none shadow-none">
            {/* Minimal file breadcrumb label */}
            {fileName && (
                <div className="flex items-center gap-2 h-8 px-4 border-b border-white/[0.04] bg-[#0d0d11]/80 backdrop-blur-sm shrink-0">
                    <FileCode className="w-3.5 h-3.5 text-purple-400/40" />
                    <span className="text-[11px] text-white/40 font-medium tracking-tight">{fileName}</span>
                    <span className="text-[10px] text-white/15 ml-auto font-mono">{language}</span>
                </div>
            )}

            {/* Monaco Editor */}
            <div className="flex-1 relative">
                <Editor
                    height="100%"
                    defaultLanguage={language}
                    value={code}
                    theme="documint-dark"
                    onChange={onChange}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
                        fontSize: 14,
                        lineHeight: 22,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                        fontLigatures: true,
                        readOnly,
                        padding: { top: 16, bottom: 16 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        automaticLayout: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        cursorStyle: "line",
                        cursorWidth: 2,
                        wordWrap: "on",
                        wrappingStrategy: "advanced",
                        renderWhitespace: "boundary",
                        renderControlCharacters: false,
                        renderLineHighlight: "all",
                        renderLineHighlightOnlyWhenFocus: false,
                        folding: true,
                        foldingHighlight: true,
                        showFoldingControls: "always",
                        matchBrackets: "near",
                        bracketPairColorization: { enabled: true },
                        tabSize: 2,
                        insertSpaces: true,
                        detectIndentation: false,
                        autoIndent: "full",
                        quickSuggestions: true,
                        suggestOnTriggerCharacters: true,
                        guides: {
                            bracketPairs: true,
                            indentation: true,
                            highlightActiveIndentation: true,
                        },
                        scrollbar: {
                            verticalScrollbarSize: 6,
                            horizontalScrollbarSize: 6,
                            useShadows: false,
                        },
                        overviewRulerBorder: false,
                        hideCursorInOverviewRuler: true,
                        stickyScroll: { enabled: true },
                    }}
                />
            </div>
        </div>
    );
}

export const SimpleEnhancedEditor = forwardRef(SimpleEnhancedEditorComponent);
