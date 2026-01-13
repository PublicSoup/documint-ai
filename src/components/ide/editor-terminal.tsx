"use client";
import React from "react";
import Editor from "@monaco-editor/react";
import { Loader2 } from "lucide-react";

interface EditorTerminalProps {
    code: string;
    language: string;
    onChange?: (value: string | undefined) => void;
    readOnly?: boolean;
}

export function EditorTerminal({ code, language, onChange, readOnly = false }: EditorTerminalProps) {
    return (
        <div className="h-full w-full bg-[#1e1e1e] overflow-hidden rounded-xl border border-white/5 shadow-2xl">
            <Editor
                height="100%"
                defaultLanguage={language}
                value={code}
                theme="vs-dark"
                onChange={onChange}
                options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    lineHeight: 22,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    readOnly,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    automaticLayout: true,
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                }}
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
