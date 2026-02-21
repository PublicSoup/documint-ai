"use client";
import { FileCode, Folder, ChevronRight, ChevronDown, Search, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import Link from "next/link";

interface FileWithDocs {
    id: string;
    name: string;
    language: string;
    size: number;
    createdAt: Date;
    documentation: {
        content: string;
        verifiedAt?: Date | null;
        verifiedById?: string | null;
        status: string;
    } | null;
}

interface DashboardFileTreeProps {
    files: FileWithDocs[];
    selectedFileId?: string;
    teamId?: string;
}

export function DashboardFileTree({ files, selectedFileId, teamId }: DashboardFileTreeProps) {
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState(true);

    const filteredFiles = useMemo(() => {
        if (!search) return files;
        return files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    }, [files, search]);

    // Group files by language for tree sections
    const groupedFiles = useMemo(() => {
        const groups: Record<string, FileWithDocs[]> = {};
        filteredFiles.forEach(file => {
            const ext = file.language || 'other';
            if (!groups[ext]) groups[ext] = [];
            groups[ext].push(file);
        });
        return groups;
    }, [filteredFiles]);

    const baseHref = teamId ? `/dashboard?teamId=${teamId}&docId=` : `/dashboard?docId=`;

    return (
        <div className="flex flex-col h-full">
            {/* Search */}
            <div className="p-3 border-b border-white/5">
                <div className="relative group">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search files..."
                        className="w-full bg-black/20 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-black/40 transition-all"
                    />
                </div>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {/* Root Folder */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 rounded cursor-pointer group"
                >
                    {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
                    <Folder className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-300" />
                    <span className="font-semibold select-none">Project Files</span>
                    <span className="ml-auto text-[10px] text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded">{files.length}</span>
                </button>

                {/* Files */}
                {expanded && (
                    <div className="pl-4 border-l border-white/5 ml-3 space-y-0.5">
                        {Object.entries(groupedFiles).map(([ext, groupFiles]) => (
                            <div key={ext}>
                                {/* Language Group Header */}
                                {Object.keys(groupedFiles).length > 1 && (
                                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wide min-w-0">
                                        <div className="w-3 h-3 rounded bg-white/10 border border-white/10 shrink-0" />
                                        <span className="truncate">{ext}</span>
                                        <span className="ml-auto shrink-0">{groupFiles.length}</span>
                                    </div>
                                )}
                                {/* Files in Group */}
                                {groupFiles.map(file => {
                                    const isSelected = selectedFileId === file.id;
                                    return (
                                        <Link
                                            key={file.id}
                                            href={`${baseHref}${file.id}`}
                                            className={cn(
                                                "w-full min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all group relative",
                                                isSelected
                                                    ? "bg-primary/10 text-primary font-medium"
                                                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            {/* Active Indicator */}
                                            {isSelected && (
                                                <div className="absolute left-0 w-0.5 h-3/4 bg-primary rounded-full" />
                                            )}

                                            <FileCode className={cn(
                                                "w-3.5 h-3.5 shrink-0 transition-colors",
                                                isSelected ? "text-primary" : "text-zinc-400 group-hover:text-white/70"
                                            )} />
                                            <span className="truncate select-none flex-1">{file.name}</span>

                                            {/* Status Badge */}
                                            {file.documentation && (
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full shrink-0",
                                                    file.documentation.status === "APPROVED" ? "bg-emerald-500" :
                                                    file.documentation.status === "REVIEW" ? "bg-blue-500 animate-pulse" :
                                                    "bg-amber-500"
                                                )} title={file.documentation.status} />
                                            )}

                                            {/* Open in IDE hint */}
                                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}
                        {filteredFiles.length === 0 && (
                            <div className="text-center py-8 text-xs text-muted-foreground italic">
                                {search ? "No matching files" : "No files uploaded yet"}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
