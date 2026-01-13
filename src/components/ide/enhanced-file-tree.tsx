"use client";

import { useState, useMemo } from "react";
import { FileCode, Folder, ChevronRight, ChevronDown, Plus, Search, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { File } from "@prisma/client";
import { ContextMenu, ContextMenuItem } from "./context-menu";
import { Copy, Trash2, Pencil, Sparkles, Download, FileText, FolderPlus, RefreshCw } from "lucide-react";

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
    onAction?: (action: "ai" | "delete" | "rename" | "new_file" | "new_folder" | "refresh", fileId?: string) => void;
    onRefresh?: () => void;
}

export function EnhancedFileTree({ files, activeFileId, onSelect, onAction, onRefresh }: EnhancedFileTreeProps) {
    const [search, setSearch] = useState("");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["Project"]));
    const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string; nodeType: "file" | "folder" } | null>(null);
    const [newItem, setNewItem] = useState<{ parentId: string; type: "file" | "folder" } | null>(null);

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
                    onClick: () => setNewItem({ parentId: nodeId, type: "file" })
                },
                {
                    label: "New Folder",
                    icon: FolderPlus,
                    onClick: () => setNewItem({ parentId: nodeId, type: "folder" })
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
                label: "New File",
                icon: Plus,
                onClick: () => onAction?.("new_file")
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
                disabled: true,
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
                <div key={node.id} className="select-none">
                    <div
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/5 rounded cursor-pointer group",
                            depth > 0 && "pl-" + (depth * 4 + 2)
                        )}
                        onClick={() => toggleFolder(node.id)}
                        onContextMenu={(e) => handleContextMenu(e, node.id, "folder")}
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-300" />
                        <span className="font-semibold flex-1">{node.name}</span>
                        <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </div>
                    {isExpanded && node.children && (
                        <div className="pl-4 border-l border-white/5 ml-3">
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
                        "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all group relative",
                        activeFileId === node.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-white hover:bg-white/5"
                    )}
                >
                    {activeFileId === node.id && (
                        <div className="absolute left-0 w-0.5 h-3/4 bg-primary rounded-full" />
                    )}
                    <FileCode className={cn(
                        "w-3.5 h-3.5 shrink-0 transition-colors",
                        activeFileId === node.id ? "text-primary" : "text-muted-foreground group-hover:text-white/70"
                    )} />
                    <span className="truncate flex-1">{node.name}</span>
                    <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
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
        <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-white/5">
            <div className="p-4 border-b border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Explorer</span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => onRefresh?.()}
                            className="text-muted-foreground hover:text-white transition-colors p-1"
                            title="Refresh"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setNewItem({ parentId: "Project", type: "file" })}
                            className="text-muted-foreground hover:text-white transition-colors p-1"
                            title="New File"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    </div>
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
                {filteredTree.length > 0 ? (
                    filteredTree.map(node => renderTreeNode(node))
                ) : (
                    <div className="text-center py-8 text-xs text-muted-foreground italic">
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

            {newItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[#1e1e1e] border border-white/10 rounded-lg p-4 w-80">
                        <h3 className="text-sm font-medium mb-3">
                            Create New {newItem.type === "file" ? "File" : "Folder"}
                        </h3>
                        <input
                            type="text"
                            placeholder={newItem.type === "file" ? "filename.ts" : "folder-name"}
                            className="w-full bg-black/20 border border-white/5 rounded px-3 py-2 text-xs text-white mb-3 focus:outline-none focus:border-primary/50"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    // Handle creation
                                    setNewItem(null);
                                }
                            }}
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setNewItem(null)}
                                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => setNewItem(null)}
                                className="px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 rounded transition-colors"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
