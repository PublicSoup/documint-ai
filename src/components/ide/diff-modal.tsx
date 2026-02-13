"use client";

import React from "react";
import { DiffEditor } from "@monaco-editor/react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, Split, FileDiff } from "lucide-react";

interface DiffModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    original: string;
    modified: string;
    language: string;
    fileName?: string;
    onApply: () => void;
    theme?: string;
}

export function DiffModal({
    open,
    onOpenChange,
    original,
    modified,
    language,
    fileName,
    onApply,
    theme = "vs-dark"
}: DiffModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[90vw] h-[90vh] bg-[#0a0a0e] border-white/10 flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-4 py-3 border-b border-white/5 bg-black/20 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-purple-500/10">
                            <FileDiff className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                            <DialogTitle className="text-sm font-medium text-white">
                                Review Changes
                            </DialogTitle>
                            {fileName && (
                                <div className="text-xs text-white/40 mt-0.5">{fileName}</div>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 bg-[#1e1e1e] relative">
                    <DiffEditor
                        height="100%"
                        language={language}
                        original={original}
                        modified={modified}
                        theme={theme}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineHeight: 20,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            scrollBeyondLastLine: false,
                            diffWordWrap: "off",
                            renderSideBySide: true,
                            padding: { top: 16 },
                            originalEditable: false,
                            automaticLayout: true,
                        }}
                    />
                </div>

                <DialogFooter className="px-4 py-3 border-t border-white/5 bg-black/20 flex-shrink-0 flex items-center justify-between sm:justify-between">
                    <div className="flex items-center gap-2 text-xs text-white/40">
                        <Split className="w-3 h-3" />
                        <span>Compare original vs proposed changes</span>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/10"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Discard
                        </Button>
                        <Button
                            onClick={() => {
                                onApply();
                                onOpenChange(false);
                            }}
                            className="bg-green-600 hover:bg-green-500 text-white border-0"
                        >
                            <Check className="w-4 h-4 mr-2" />
                            Apply Changes
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
