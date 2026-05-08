"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Search as SearchIcon, X, Loader2, FileCode, CornerDownLeft } from "lucide-react";
import { EnhancedFileTree } from "./enhanced-file-tree";
import { Button } from "../ui/button";
import type { File } from "@prisma/client";
import { cn } from "@/lib/utils";
import FileCodeIcon from "../file-code-icon";

interface SidebarProps {
    activeTab: "explorer" | "search" | "git";
    files: (File & { content?: string | null })[];
    activeFileId?: string;
    onFileSelect: (fileId: string) => void;
    onAction: (action: any, fileId?: string) => void;
    onRefresh: () => void;
}

interface SearchResult {
    id: string;
    name: string;
    language: string | null;
    updatedAt: string;
    documentation?: {
        status: string;
    };
}

export function Sidebar({ activeTab, files, activeFileId, onFileSelect, onAction, onRefresh }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const performSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) {
            setSearchResults([]);
            setSearchError(null);
            return;
        }

        setIsSearching(true);
        setSearchError(null);
        try {
            const params = new URLSearchParams({ q });
            const res = await fetch(`/api/files/search?${params}`);
            const data = (await res.json().catch(() => ({}))) as { results?: SearchResult[]; error?: string };

            if (!res.ok) {
                throw new Error(data.error || "Search failed");
            }

            setSearchResults(data.results || []);
        } catch (error) {
            console.error("IDE Sidebar search failed:", error);
            setSearchError("Failed to search files.");
        } finally {
            setIsSearching(false);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (activeTab === "search") {
                performSearch(searchQuery);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, performSearch, activeTab]);

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
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-white/5">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Search</h2>
                        <div className="relative">
                            <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search in project..."
                                className="w-full bg-black/20 border border-white/5 rounded-md pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50"
                                autoFocus
                            />
                            {isSearching && (
                                <Loader2 className="w-3 h-3 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-primary" />
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                        {searchQuery.trim().length < 2 ? (
                            <div className="h-full flex items-center justify-center text-center p-4">
                                <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">Type at least 2 chars to search</p>
                            </div>
                        ) : searchError ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-4 gap-2">
                                <X className="w-6 h-6 text-rose-500/50" />
                                <p className="text-[10px] text-rose-400 font-bold uppercase">{searchError}</p>
                            </div>
                        ) : searchResults.length === 0 && !isSearching ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-4 gap-2">
                                <FileCode className="w-6 h-6 text-white/10" />
                                <p className="text-[10px] text-white/20 font-bold uppercase tracking-tight">No results found</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {searchResults.map((result) => (
                                    <button
                                        key={result.id}
                                        onClick={() => onFileSelect(result.id)}
                                        className={cn(
                                            "w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 border border-transparent transition-all text-left group",
                                            activeFileId === result.id ? "bg-primary/10 border-primary/20" : ""
                                        )}
                                    >
                                        <div className="w-7 h-7 rounded bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                                            <FileCodeIcon language={result.language || ""} className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-white group-hover:text-primary transition-colors truncate">{result.name}</p>
                                            <p className="text-[9px] text-zinc-500 uppercase font-black">{result.language || "text"}</p>
                                        </div>
                                        <CornerDownLeft className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                            </div>
                        )}
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
