"use client";
import { FileCode, Folder, ChevronRight, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import Link from "next/link";
import { buildFileTree, filterTree, type TreeNode } from "@/lib/file-tree";

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
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
        new Set(["Project"])
    );

    const treeStructure = useMemo(() => buildFileTree(files as unknown as { id: string; name: string; language?: string | null }[]), [files]);
    const filteredTree = useMemo(
        () => filterTree(treeStructure, search),
        [treeStructure, search]
    );

    const toggleFolder = (folderId: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) {
                next.delete(folderId);
            } else {
                next.add(folderId);
            }
            return next;
        });
    };

    const baseHref = teamId ? `/dashboard?teamId=${teamId}&docId=` : `/dashboard?docId=`;

    const renderNode = (node: TreeNode, depth = 0): React.ReactNode => {
        if (node.type === "folder") {
            const isExpanded = expandedFolders.has(node.id);
            return (
                <div key={node.id} className="select-none">
                    <button
                        type="button"
                        onClick={() => toggleFolder(node.id)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-white/50 hover:text-white/70 hover:bg-white/5 rounded cursor-pointer group transition-colors"
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                        ) : (
                            <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />
                        )}
                        <Folder
                            className={cn(
                                "w-3.5 h-3.5 shrink-0 transition-colors",
                                isExpanded ? "text-blue-400" : "text-blue-400/50"
                            )}
                        />
                        <span className="font-semibold truncate text-[11px] select-none">
                            {node.name}
                        </span>
                        {node.children && (
                            <span className="ml-auto text-[10px] text-zinc-500 bg-white/5 px-1 py-0.5 rounded shrink-0">
                                {node.children.length}
                            </span>
                        )}
                    </button>
                    {isExpanded && node.children && (
                        <div className="border-l border-white/5 ml-3">
                            {node.children.map((child) => renderNode(child, depth + 1))}
                        </div>
                    )}
                </div>
            );
        }

        // File node
        const isSelected = selectedFileId === node.fileId;
        const ext = node.name.split(".").pop()?.toLowerCase() || "";
        const iconColor = FILE_ICON_COLORS[ext] || "text-zinc-400";

        return (
            <Link
                key={node.id}
                href={`${baseHref}${node.fileId}`}
                className={cn(
                    "w-full min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all group relative",
                    isSelected
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
                style={{ paddingLeft: `${depth * 12 + 24}px` }}
            >
                {isSelected && (
                    <div className="absolute left-0 w-0.5 h-3/4 bg-primary rounded-full" />
                )}
                <FileCode className={cn("w-3.5 h-3.5 shrink-0", iconColor)} />
                <span className="truncate select-none flex-1">{node.name}</span>
            </Link>
        );
    };

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
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                {filteredTree.length > 0 ? (
                    filteredTree.map((node) => renderNode(node))
                ) : (
                    <div className="text-center py-8 text-xs text-muted-foreground italic">
                        {search ? "No matching files" : "No files uploaded yet"}
                    </div>
                )}
            </div>
        </div>
    );
}

// File extension → icon color mapping
const FILE_ICON_COLORS: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    mjs: "text-yellow-400",
    css: "text-purple-400",
    scss: "text-pink-400",
    html: "text-orange-400",
    json: "text-amber-400",
    md: "text-white/40",
    mdx: "text-white/40",
    py: "text-emerald-400",
    rb: "text-red-400",
    rs: "text-orange-500",
    go: "text-cyan-400",
    java: "text-red-500",
    env: "text-amber-500",
    toml: "text-gray-400",
    yml: "text-rose-400",
    yaml: "text-rose-400",
    sh: "text-emerald-500",
    sql: "text-cyan-300",
    graphql: "text-pink-500",
    dockerfile: "text-blue-500",
};