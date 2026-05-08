"use client";

import { useState, useMemo } from "react";
import { FileCode, Folder, ChevronRight, ChevronDown, Plus, Search, MoreHorizontal, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { File } from "@prisma/client";
import { ContextMenu, ContextMenuItem } from "./context-menu";
import { Copy, Trash2, Pencil, Sparkles, Download, FileText, FolderPlus, RefreshCw } from "lucide-react";

// File icon color mapping by extension
function getFileIconColor(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const colorMap: Record<string, string> = {
        ts: 'text-blue-400', tsx: 'text-blue-400',
        js: 'text-yellow-400', jsx: 'text-yellow-400', mjs: 'text-yellow-400',
        css: 'text-purple-400', scss: 'text-pink-400', less: 'text-indigo-400',
        html: 'text-orange-400', htm: 'text-orange-400',
        json: 'text-amber-400', jsonc: 'text-amber-400',
        md: 'text-white/40', mdx: 'text-white/40',
        py: 'text-emerald-400', rb: 'text-red-400', rs: 'text-orange-500',
        go: 'text-cyan-400', java: 'text-red-500',
        env: 'text-amber-500', toml: 'text-gray-400', yml: 'text-rose-400', yaml: 'text-rose-400',
        svg: 'text-lime-400', png: 'text-violet-400', jpg: 'text-violet-400',
        sh: 'text-emerald-500', bash: 'text-emerald-500',
        sql: 'text-cyan-300', graphql: 'text-pink-500',
        dockerfile: 'text-blue-500',
    };
    return colorMap[ext] || 'text-white/25';
}

interface TreeNode {
    id: string;
    name: string;
    type: "file" | "folder";
    children?: TreeNode[];
    file?: File & { documentation?: any };
}

interface EnhancedFileTreeProps {
    files: (File & { documentation?: any })[];
    activeFileId?: string;
    onSelect: (fileId: string) => void;
    onAction?: (action: "ai" | "delete" | "rename" | "new_file" | "new_folder", fileId?: string) => void;
    onRefresh?: () => void;
}

export function EnhancedFileTree({ files, activeFileId, onSelect, onAction, onRefresh }: EnhancedFileTreeProps) {
    const [search, setSearch] = useState("");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["Project"]));
    const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string; nodeType: "file" | "folder" } | null>(null);

    // Build tree structure from flat files
    const buildTree = (files: File[]): TreeNode[] => {
        const tree: TreeNode[] = [];
        const folderMap = new Map<string, TreeNode>();

        // Helper to get or create folder
        const getOrCreateFolder = (path: string, parentPath: string = ""): TreeNode => {
            const fullPath = parentPath ? `${parentPath}/${path}` : path;

            if (folderMap.has(fullPath)) {
                return folderMap.get(fullPath)!;
            }

            const folder: TreeNode = {
                id: fullPath,
                name: path,
                type: "folder",
                children: []
            };
            folderMap.set(fullPath, folder);

            if (parentPath) {
                const parent = folderMap.get(parentPath);
                if (parent && parent.children) {
                    parent.children.push(folder);
                }
            } else {
                tree.push(folder);
            }

            return folder;
        };

        // Create root folder
        const rootFolder = getOrCreateFolder("Project");

        // Process each file
        files.forEach(file => {
            // Parse file path if it contains slashes
            const pathParts = file.name.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const folderParts = pathParts.slice(0, -1);

            let currentFolder = rootFolder;
            let currentPath = "Project";

            // Create nested folders
            folderParts.forEach(folderName => {
                const existingFolder = currentFolder.children?.find(
                    child => child.type === "folder" && child.name === folderName
                );

                if (existingFolder) {
                    currentFolder = existingFolder;
                    currentPath = existingFolder.id;
                } else {
                    currentFolder = getOrCreateFolder(folderName, currentPath);
                    currentPath = currentFolder.id;
                }
            });

            // Add file to current folder
            const fileNode: TreeNode = {
                id: file.id,
                name: fileName,
                type: "file",
                file: file
            };

            if (currentFolder.children) {
                currentFolder.children.push(fileNode);
            }
        });

        return tree;
    };

    const treeStructure = useMemo(() => buildTree(files), [files]);

    const toggleFolder = (folderId: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) {
                newSet.delete(folderId);
            } else {
                newSet.add(folderId);
            }
            return newSet;
        });
    };

    const handleContextMenu = (e: React.MouseEvent, nodeId: string, nodeType: "file" | "folder") => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, nodeId, nodeType });
    };

    const getMenuItems = (nodeId: string, nodeType: "file" | "folder"): ContextMenuItem[] => {
        if (nodeType === "folder") {
            return [
                {
                    label: "New File",
                    icon: FileText,
                    onClick: () => onAction?.("new_file", nodeId)
                },
                {
                    label: "New Folder",
                    icon: FolderPlus,
                    onClick: () => onAction?.("new_folder", nodeId)
                },
                { separator: true, label: "" },
                {
                    label: "Refresh",
                    icon: RefreshCw,
                    onClick: () => onRefresh?.()
                }
            ];
        }

        const file = files.find(f => f.id === nodeId);
        if (!file) return [];

        return [
            {
                label: "Open File",
                icon: FileText,
                onClick: () => onSelect(nodeId)
            },
            {
                label: "Ask AI Architect",
                icon: Sparkles,
                onClick: () => onAction?.("ai", nodeId),
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
                onClick: () => navigator.clipboard.writeText(file.name)
            },
            { separator: true, label: "" },
            {
                label: "Rename",
                icon: Pencil,
                onClick: () => onAction?.("rename", nodeId),
                shortcut: "F2"
            },
            {
                label: "Delete",
                icon: Trash2,
                variant: "danger",
                shortcut: "Del",
                onClick: () => onAction?.("delete", nodeId)
            }
        ];
    };

    const renderTreeNode = (node: TreeNode, depth = 0) => {
        if (node.type === "folder") {
            const isExpanded = expandedFolders.has(node.id);
            return (
                <div key={node.id} className="select-none flex flex-col w-full min-w-0">
                    <div
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.04] rounded cursor-pointer group w-full transition-colors"
                        )}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        onClick={() => toggleFolder(node.id)}
                        onContextMenu={(e) => handleContextMenu(e, node.id, "folder")}
                    >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isExpanded ? (
                                <ChevronDown className="w-3 h-3 text-white/20 shrink-0" />
                            ) : (
                                <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
                            )}
                            <Folder className={cn("w-3 h-3 shrink-0 transition-colors", isExpanded ? "text-purple-400/70" : "text-purple-400/40 group-hover:text-purple-400/60")} />
                            <span className="font-semibold truncate text-[11px]">{node.name}</span>
                        </div>
                        <MoreHorizontal className="w-3 h-3 text-white/15 opacity-0 group-hover:opacity-100 shrink-0 ml-1" />
                    </div>
                    {isExpanded && node.children && (
                        <div className="border-l border-white/[0.04] ml-3">
                            {node.children.map(child => renderTreeNode(child, depth + 1))}
                        </div>
                    )}
                </div>
            );
        } else {
            return (
                <div
                    key={node.id}
                    onClick={() => node.file && onSelect(node.file.id)}
                    onContextMenu={(e) => node.file && handleContextMenu(e, node.file.id, "file")}
                    className={cn(
                        "flex items-center gap-2 px-2 py-1 transition-all group relative rounded text-[11px] w-full min-w-0",
                        activeFileId === node.id
                            ? "bg-purple-500/10 text-white font-medium"
                            : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                    )}
                    style={{ paddingLeft: `${depth * 12 + 24}px` }}
                >
                    {activeFileId === node.id && (
                        <div className="absolute left-0 w-0.5 h-3/4 bg-purple-400 rounded-full" />
                    )}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCode className={cn(
                            "w-3 h-3 shrink-0 transition-colors",
                            activeFileId === node.id ? getFileIconColor(node.name) : getFileIconColor(node.name)
                        )} />
                        <span className="truncate">{node.name}</span>
                        {node.name.endsWith('.env') && (
                            <Lock className="w-3 h-3 text-amber-500/50 shrink-0 ml-auto" />
                        )}
                    </div>
                    <MoreHorizontal className="w-3 h-3 text-white/15 opacity-0 group-hover:opacity-100 shrink-0 ml-1" />
                </div>
            );
        }
    };

    const filteredTree = useMemo(() => {
        if (!search) return treeStructure;

        const filterNode = (node: TreeNode): TreeNode | null => {
            if (node.type === "file") {
                if (node.name.toLowerCase().includes(search.toLowerCase())) {
                    return node;
                }
                return null;
            }

            if (node.children) {
                const filteredChildren = node.children
                    .map(child => filterNode(child))
                    .filter(Boolean) as TreeNode[];

                if (filteredChildren.length > 0 || node.name.toLowerCase().includes(search.toLowerCase())) {
                    return {
                        ...node,
                        children: filteredChildren
                    };
                }
            }

            return null;
        };

        return treeStructure.map(node => filterNode(node)).filter(Boolean) as TreeNode[];
    }, [treeStructure, search]);

    return (
        <div className="flex flex-col h-full bg-[#030014] border-r border-white/[0.04] overflow-hidden">
            <div className="p-4 border-b border-white/[0.04] space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Explorer</span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => onRefresh?.()}
                            className="text-white/25 hover:text-white/50 transition-colors p-1 rounded hover:bg-white/[0.04]"
                            title="Refresh"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => onAction?.("new_file", "Project")}
                            className="text-white/25 hover:text-white/50 transition-colors p-1 rounded hover:bg-white/[0.04]"
                            title="New File"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <div className="relative group px-1">
                    <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-purple-400/60 transition-colors" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full bg-black/20 border border-white/[0.06] rounded-lg pl-7 pr-2 py-1 text-[10px] text-white placeholder:text-white/15 focus:outline-none focus:border-purple-500/40 focus:bg-black/30 transition-all"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-0.5 custom-scrollbar">
                {filteredTree.length > 0 ? (
                    filteredTree.map(node => renderTreeNode(node))
                ) : (
                    <div className="text-center py-8 text-xs text-white/15 italic">
                        No files found
                    </div>
                )}
            </div>

            {menu && (
                <ContextMenu
                    x={menu.x}
                    y={menu.y}
                    items={getMenuItems(menu.nodeId, menu.nodeType)}
                    onClose={() => setMenu(null)}
                />
            )}
        </div>
    );
}
