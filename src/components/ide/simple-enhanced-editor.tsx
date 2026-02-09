"use client";

import React, { useState, useRef, forwardRef, useImperativeHandle } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import {
    Play,
    Save,
    Search,
    ZoomIn,
    ZoomOut,
    FileCode,
    History,
    Copy,
    Download,
    GitBranch
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SimpleEnhancedEditorProps {
    code: string;
    language: string;
    fileName?: string;
    onChange?: (value: string | undefined) => void;
    onSave?: () => void;
    onRun?: () => void;
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
    readOnly = false,
    theme = "vs-dark"
}: SimpleEnhancedEditorProps, ref: React.Ref<SimpleEnhancedEditorRef>) => {
    const [zoomLevel, setZoomLevel] = useState(100);
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
    const [lineCount, setLineCount] = useState(0);
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
                    // Calculate new position after insertion
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
                    // Move cursor to end
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

        // Track cursor position
        editor.onDidChangeCursorPosition((e: any) => {
            setCursorPosition({
                line: e.position.lineNumber,
                column: e.position.column
            });
        });

        // Track line count
        const model = editor.getModel();
        if (model) {
            setLineCount(model.getLineCount());
            model.onDidChangeContent(() => {
                setLineCount(model.getLineCount());
            });
        }
    };

    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(prev + 10, 200));
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(prev - 10, 50));
    };

    const handleResetZoom = () => {
        setZoomLevel(100);
    };

    const handleFind = () => {
        if (editorRef.current && searchTerm) {
            const editor = editorRef.current;
            const model = editor.getModel();
            const matches = model.findMatches(searchTerm, false, false, false, null, true);
            if (matches.length > 0) {
                editor.revealRange(matches[0].range);
                editor.setPosition(matches[0].range.getStartPosition());
            }
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
    };

    const handleDownload = () => {
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'code.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="h-full w-full bg-[#1e1e1e] overflow-hidden flex flex-col border-0 rounded-none shadow-none">
            {/* Editor Header Toolbar */}
            <div className="flex items-center justify-between h-10 bg-[#1e1e1e] border-b border-white/5 px-3 shrink-0">
                <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate max-w-32">
                        {fileName || "Untitled"}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {/* Search */}
                    {showSearch && (
                        <div className="flex items-center gap-2 mr-2">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Find..."
                                className="w-32 bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary/50"
                                onKeyDown={(e) => e.key === 'Enter' && handleFind()}
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={handleFind}
                            >
                                Find
                            </Button>
                        </div>
                    )}

                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setShowSearch(!showSearch)}
                        title="Find"
                    >
                        <Search className="w-4 h-4" />
                    </Button>

                    {/* Zoom Controls */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={handleZoomIn}
                        title="Zoom In"
                    >
                        <ZoomIn className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={handleZoomOut}
                        title="Zoom Out"
                    >
                        <ZoomOut className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={handleResetZoom}
                        title="Reset Zoom"
                    >
                        {zoomLevel}%
                    </Button>

                    <div className="w-px h-4 bg-white/10 mx-1" />

                    {/* File Operations */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={handleCopy}
                        title="Copy"
                    >
                        <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={handleDownload}
                        title="Download"
                    >
                        <Download className="w-4 h-4" />
                    </Button>

                    <div className="w-px h-4 bg-white/10 mx-1" />

                    {/* Save */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-green-500 hover:text-green-400 hover:bg-green-500/20"
                        onClick={onSave}
                        title="Save"
                    >
                        <Save className="w-4 h-4" />
                    </Button>

                    {/* Run */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-blue-500 hover:text-blue-400 hover:bg-blue-500/20"
                        onClick={onRun}
                        title="Run"
                    >
                        <Play className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 relative">
                <Editor
                    height="100%"
                    defaultLanguage={language}
                    value={code}
                    theme={theme}
                    onChange={onChange}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: true },
                        fontSize: Math.round(14 * (zoomLevel / 100)),
                        lineHeight: Math.round(22 * (zoomLevel / 100)),
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        readOnly,
                        padding: { top: 16 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        automaticLayout: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        wordWrap: "on",
                        wrappingStrategy: "advanced",
                        renderWhitespace: "boundary",
                        renderControlCharacters: false,
                        renderLineHighlight: "all",
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
                    }}
                />
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between h-6 bg-[#007acc] text-white text-xs px-3 shrink-0">
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        main
                    </span>
                    <span className="flex items-center gap-1">
                        <History className="w-3 h-3" />
                        Ready
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
                    <span>{lineCount} lines</span>
                    <span>{language.toUpperCase()}</span>
                    <span>UTF-8</span>
                </div>
            </div>
        </div>
    );
}

export const SimpleEnhancedEditor = forwardRef(SimpleEnhancedEditorComponent);
