
import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IDEFile } from "./shared/types";

interface EditorTabsProps {
    openFiles: string[];
    files: IDEFile[];
    activeFileId?: string;
    unsavedChanges: Record<string, boolean>;
    onFileSelect: (fileId: string) => void;
    onCloseFile: (e: React.MouseEvent, fileId: string) => void;
}

export function EditorTabs({ openFiles, files, activeFileId, unsavedChanges, onFileSelect, onCloseFile }: EditorTabsProps) {
    return (
        <div className="flex items-center h-full overflow-x-auto custom-scrollbar">
            {openFiles.map(fileId => {
                const file = files.find(f => f.id === fileId);
                if (!file) return null;
                const isActive = fileId === activeFileId;
                const isUnsaved = unsavedChanges[fileId];

                return (
                    <div
                        key={fileId}
                        onClick={() => onFileSelect(fileId)}
                        className={cn(
                            "h-full px-3 flex items-center gap-2 text-xs border-r border-white/[0.04] cursor-pointer transition-all duration-200 min-w-[100px] max-w-[200px] group relative",
                            isActive ? "bg-[#030014] text-white" : "bg-[#020010] text-white/40 hover:bg-[#030014]/80 hover:text-white/60"
                        )}
                    >
                        {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 to-violet-400" />}
                        <span className="truncate">{file.name}</span>
                        {isUnsaved && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />}
                        <button
                            type="button"
                            onClick={(e) => onCloseFile(e, fileId)}
                            className={cn("opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-white/10", isActive && "opacity-100")}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
