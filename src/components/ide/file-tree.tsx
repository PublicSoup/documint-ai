"use client";
import { FileCode, Folder, ChevronRight, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { File } from "@prisma/client";

interface FileTreeProps {
    files: (File & { documentation?: any })[];
    activeFileId?: string;
    onSelect: (fileId: string) => void;
    onAction?: (action: "ai" | "delete" | "rename" | "new_file", fileId?: string) => void;
}

import { ContextMenu, ContextMenuItem } from "./context-menu";
import { Copy, Trash2, Pencil, Sparkles, Download, FileText } from "lucide-react";

export function FileTree({ files, activeFileId, onSelect, onAction }: FileTreeProps) {
    const [search, setSearch] = useState("");
    const [isExpanded, setIsExpanded] = useState(true);
    const [menu, setMenu] = useState<{ x: number; y: number; fileId: string } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, fileId });
    };

    const getMenuItems = (fileId: string): ContextMenuItem[] => {
        const file = files.find(f => f.id === fileId);
        if (!file) return [];

        return [
            {
                label: "Open File",
                icon: FileText,
                onClick: () => onSelect(fileId)
            },
            {
                label: "New File",
                icon: Plus,
                onClick: () => onAction?.("new_file")
            },
            {
                label: "Ask AI Architect",
                icon: Sparkles,
                onClick: () => onAction?.("ai", fileId),
                shortcut: "AI"
            },
            { separator: true, label: "" },
            {
                label: "Copy Name",
                icon: Copy,
                onClick: () => navigator.clipboard.writeText(file.name)
            },
            {
                label: "Copy Path",
                icon: Copy,
                onClick: () => navigator.clipboard.writeText(file.name) // Real app would use full path
            },
            { separator: true, label: "" },
            {
                label: "Rename",
                icon: Pencil,
                disabled: true, // TODO: Implement renaming
                shortcut: "F2"
            },
            {
                label: "Delete",
                icon: Trash2,
                variant: "danger",
                shortcut: "Del",
                onClick: () => onAction?.("delete", fileId)
            }
        ];
    };

    const filteredFiles = useMemo(() => {
        if (!search) return files;
        return files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    }, [files, search]);

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-white/5">
            <div className="p-4 border-b border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Explorer</span>
                    <button
                        onClick={() => onAction?.("new_file")}
                        className="text-muted-foreground hover:text-white transition-colors"
                        title="New File"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                <div className="relative group">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search files..."
                        className="w-full bg-black/20 border border-white/5 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-black/40 transition-all"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                {/* Mock Folder Structure for Visuals (Since DB is flat) */}
                <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 rounded cursor-pointer group select-none transition-colors"
                >
                    {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform" />
                    )}
                    <Folder className={cn("w-3.5 h-3.5 transition-colors", isExpanded ? "text-blue-400 group-hover:text-blue-300" : "text-blue-400/70")} />
                    <span className={cn("font-semibold", !isExpanded && "text-muted-foreground")}>src</span>
                </div>

                {isExpanded && (
                    <div className="pl-4 border-l border-white/5 ml-3 space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                        {filteredFiles.map(file => (
                            <button
                                key={file.id}
                                onClick={() => onSelect(file.id)}
                                onContextMenu={(e) => handleContextMenu(e, file.id)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all group relative",
                                    activeFileId === file.id
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "text-muted-foreground hover:text-white hover:bg-white/5"
                                )}
                            >
                                {/* Active Indicator */}
                                {activeFileId === file.id && (
                                    <div className="absolute left-0 w-0.5 h-3/4 bg-primary rounded-full" />
                                )}

                                <FileCode className={cn(
                                    "w-3.5 h-3.5 shrink-0 transition-colors",
                                    activeFileId === file.id ? "text-primary" : "text-muted-foreground group-hover:text-white/70"
                                )} />
                                <span className="truncate select-none">{file.name}</span>
                            </button>
                        ))}
                        {filteredFiles.length === 0 && (
                            <div className="text-center py-8 text-xs text-muted-foreground italic">
                                No files found
                            </div>
                        )}
                    </div>
                )}
            </div>
            {menu && (
                <ContextMenu
                    x={menu.x}
                    y={menu.y}
                    items={getMenuItems(menu.fileId)}
                    onClose={() => setMenu(null)}
                />
            )}
        </div>
    );
}
