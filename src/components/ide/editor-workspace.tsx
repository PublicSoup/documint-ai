"use client";

import type { Monaco } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";
import type React from "react";

import ErrorBoundary from "@/components/error-boundary";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";
import { ProjectTemplates } from "./project-templates";
import { SimpleEnhancedEditor, type SimpleEnhancedEditorRef } from "./simple-enhanced-editor";
import { getLanguageFromFileName } from "./shared/ide-constants";
import type { IDEFile } from "./shared/types";

interface IDEEditorWorkspaceProps {
    activeFile?: IDEFile;
    activeFileId?: string;
    code?: string;
    showInspector: boolean;
    editorRef: React.Ref<SimpleEnhancedEditorRef>;
    onChange: (value: string | undefined) => void;
    onSave: () => void;
    onRun: () => void;
    onMonacoMount: (monaco: Monaco) => void;
    onCursorChange: (line: number, column: number) => void;
    onSelectTemplate: (files: { name: string; content: string }[], projectName?: string) => void | Promise<void>;
}

export function IDEEditorWorkspace({
    activeFile,
    activeFileId,
    code,
    showInspector,
    editorRef,
    onChange,
    onSave,
    onRun,
    onMonacoMount,
    onCursorChange,
    onSelectTemplate,
}: IDEEditorWorkspaceProps) {
    return (
        <section className={cn("flex-1 min-w-0 relative h-full transition-colors", showInspector && "border-r border-white/[0.06]")}>
            {activeFileId && activeFile ? (
                code === undefined ? (
                    <div className="h-full flex items-center justify-center bg-[#080612]">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-300/60" />
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        <Breadcrumbs filePath={activeFile.name} />
                        <div className="flex-1 min-h-0">
                            <ErrorBoundary>
                                <SimpleEnhancedEditor
                                    key={activeFileId}
                                    ref={editorRef}
                                    code={code}
                                    language={getLanguageFromFileName(activeFile.name)}
                                    fileName={activeFile.name}
                                    onChange={onChange}
                                    onSave={onSave}
                                    onRun={onRun}
                                    onMonacoMount={onMonacoMount}
                                    onCursorChange={onCursorChange}
                                />
                            </ErrorBoundary>
                        </div>
                    </div>
                )
            ) : (
                <ProjectTemplates onSelectTemplate={onSelectTemplate} />
            )}
        </section>
    );
}