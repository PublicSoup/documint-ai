
import React from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { EnhancedFileTree } from "./enhanced-file-tree";
import { Button } from "../ui/button";
import { File } from "@prisma/client";

interface SidebarProps {
    activeTab: "explorer" | "search" | "git";
    files: (File & { content?: string | null })[];
    activeFileId?: string;
    onFileSelect: (fileId: string) => void;
    onAction: (action: any, fileId?: string) => void;
    onRefresh: () => void;
}

export function Sidebar({ activeTab, files, activeFileId, onFileSelect, onAction, onRefresh }: SidebarProps) {
    return (
        <div className="w-56 md:w-64 flex-none flex flex-col border-r border-white/5 bg-[#030014] h-full overflow-hidden animate-in slide-in-from-left-1 duration-200 z-30">
            {activeTab === "explorer" && (
                <EnhancedFileTree
                    files={files}
                    activeFileId={activeFileId}
                    onSelect={onFileSelect}
                    onAction={onAction}
                    onRefresh={onRefresh}
                />
            )}
            {activeTab === "search" && (
                <div className="flex flex-col h-full">
                    <div className="p-4 border-b border-white/5">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Search</h2>
                        <div className="relative">
                            <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                            <input
                                placeholder="Search in project..."
                                className="w-full bg-black/20 border border-white/5 rounded-md pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50"
                            />
                        </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-4 text-center">
                        <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">Search results will appear here</p>
                    </div>
                </div>
            )}
            {activeTab === "git" && (
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30">Source Control</h2>
                        <div className="bg-white/5 rounded-md p-3 border border-white/5">
                            <p className="text-xs text-white/70 mb-2 font-medium">Staged Changes</p>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-emerald-400/80 hover:bg-white/5 p-1 rounded group cursor-pointer">
                                    <span className="truncate flex-1">modified: package.json</span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                        <X className="w-3 h-3 hover:text-red-400" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white/5 rounded-md p-3 border border-white/5">
                            <p className="text-xs text-white/70 mb-2 font-medium">Changes</p>
                            <div className="space-y-1 italic text-white/20 text-[10px]">
                                No unstaged changes
                            </div>
                        </div>
                    </div>
                    <div className="p-4 mt-auto border-t border-white/5">
                        <textarea
                            placeholder="Message (Cmd+Enter to commit)"
                            className="w-full bg-black/20 border border-white/10 rounded-md p-2 text-xs text-white focus:outline-none focus:border-primary/50 resize-none h-20 mb-2"
                        />
                        <Button className="w-full h-8 text-xs font-bold" size="sm">Commit to main</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
