"use client";

import React, { useState, useRef, useEffect } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import {
    Play,
    Save,
    RotateCcw,
    Search,
    Replace,
    ZoomIn,
    ZoomOut,
    Settings,
    FileCode,
    Bug,
    Zap,
    GitBranch,
    History,
    Copy,
    Download,
    Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EnhancedEditorProps {
    code: string;
    language: string;
    fileName?: string;
    onChange?: (value: string | undefined) => void;
    onSave?: () => void;
    onRun?: () => void;
    readOnly?: boolean;
    theme?: "vs-dark" | "light" | "hc-black";
}

export function EnhancedEditor({
    code,
    language,
    fileName,
    onChange,
    onSave,
    onRun,
    readOnly = false,
    theme = "vs-dark"
}: EnhancedEditorProps) {
    const [zoomLevel, setZoomLevel] = useState(100);
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [replaceTerm, setReplaceTerm] = useState("");
    const [isReplacing, setIsReplacing] = useState(false);
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
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

    const handleReplace = () => {
        if (editorRef.current && searchTerm && replaceTerm) {
            const editor = editorRef.current;
            editor.trigger('keyboard', 'editor.action.replaceAll', {
                searchString: searchTerm,
                replaceString: replaceTerm
            });
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
        <div className="h-full w-full bg-[#1e1e1e] overflow-hidden rounded-xl border border-white/5 shadow-2xl flex flex-col">
            {/* Editor Header Toolbar */}
            <div className="flex items-center justify-between h-10 bg-[#1e1e1e] border-b border-white/5 px-3 shrink-0">
                <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate max-w-32">
                        {fileName || "Untitled"}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {/* Search/Replace */}
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
                            {isReplacing && (
                                <input
                                    type="text"
                                    value={replaceTerm}
                                    onChange={(e) => setReplaceTerm(e.target.value)}
                                    placeholder="Replace..."
                                    className="w-32 bg-black/20 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary/50"
                                />
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={handleFind}
                            >
                                Find
                            </Button>
                            {isReplacing && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={handleReplace}
                                >
                                    Replace All
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => setIsReplacing(!isReplacing)}
                            >
                                {isReplacing ? "Hide" : "Replace"}
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
                        renderIndentGuides: true,
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
                        suggestOnTriggerCharacters: true,
                        acceptSuggestionOnCommitCharacter: true,
                        acceptSuggestionOnEnter: "on",
                        suggest: {
                            showKeywords: true,
                            showSnippets: true,
                            showClasses: true,
                            showFunctions: true,
                            showVariables: true,
                            showProperties: true,
                            showMethods: true,
                            showIcons: true,
                        },
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
                        Saved
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span>{language.toUpperCase()}</span>
                    <span>UTF-8</span>
                    <span>LF</span>
                </div>
            </div>
        </div>
    );
}
