"use client";

import { useState, useMemo } from "react";
import { FileCode, Folder, ChevronRight, ChevronDown, Plus, Search, MoreHorizontal, Lock } from "lucide-react";
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
    const [renamingItem, setRenamingItem] = useState<{ id: string; name: string } | null>(null);

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
                onClick: () => setRenamingItem({ id: nodeId, name: file.name }),
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
                            "flex items-center gap-1.5 px-2 py-1 text-xs text-white/70 hover:text-white hover:bg-white/5 rounded cursor-pointer group w-full"
                        )}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        onClick={() => toggleFolder(node.id)}
                        onContextMenu={(e) => handleContextMenu(e, node.id, "folder")}
                    >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isExpanded ? (
                                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                            ) : (
                                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            )}
                            <Folder className="w-3 h-3 text-blue-400 group-hover:text-blue-300 shrink-0" />
                            <span className="font-semibold truncate text-[11px]">{node.name}</span>
                        </div>
                        <MoreHorizontal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 ml-1" />
                    </div>
                    {isExpanded && node.children && (
                        <div className="border-l border-white/5 ml-3">
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
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-white hover:bg-white/5"
                    )}
                    style={{ paddingLeft: `${depth * 12 + 24}px` }}
                >
                    {activeFileId === node.id && (
                        <div className="absolute left-0 w-0.5 h-3/4 bg-primary rounded-full" />
                    )}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCode className={cn(
                            "w-3 h-3 shrink-0 transition-colors",
                            activeFileId === node.id ? "text-primary" : "text-muted-foreground group-hover:text-white/70"
                        )} />
                        <span className="truncate">{node.name}</span>
                        {node.name.endsWith('.env') && (
                            <Lock className="w-3 h-3 text-amber-500/50 shrink-0 ml-auto" />
                        )}
                    </div>
                    <MoreHorizontal className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 ml-1" />
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
        <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/5 space-y-3 shrink-0">
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
                <div className="relative group px-1">
                    <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full bg-black/20 border border-white/5 rounded-lg pl-7 pr-2 py-1 text-[10px] text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-black/40 transition-all"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto p-2 space-y-0.5 custom-scrollbar">
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

            {renamingItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[#1e1e1e] border border-white/10 rounded-lg p-4 w-80">
                        <h3 className="text-sm font-medium mb-3">Rename Item</h3>
                        <input
                            type="text"
                            defaultValue={renamingItem.name}
                            className="w-full bg-black/20 border border-white/5 rounded px-3 py-2 text-xs text-white mb-3 focus:outline-none focus:border-primary/50"
                            autoFocus
                            onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                    const newName = (e.target as HTMLInputElement).value;
                                    if (newName && newName !== renamingItem.name) {
                                        try {
                                            const res = await fetch(`/api/files/${renamingItem.id}/raw`, {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ name: newName })
                                            });
                                            if (res.ok) {
                                                onRefresh?.();
                                            }
                                        } catch (err) {
                                            console.error("Failed to rename:", err);
                                        }
                                    }
                                    setRenamingItem(null);
                                } else if (e.key === "Escape") {
                                    setRenamingItem(null);
                                }
                            }}
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setRenamingItem(null)}
                                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                                    const newName = input.value;
                                    if (newName && newName !== renamingItem.name) {
                                        try {
                                            const res = await fetch(`/api/files/${renamingItem.id}/raw`, {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ name: newName })
                                            });
                                            if (res.ok) {
                                                onRefresh?.();
                                            }
                                        } catch (err) {
                                            console.error("Failed to rename:", err);
                                        }
                                    }
                                    setRenamingItem(null);
                                }}
                                className="px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 rounded transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
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
                            onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                    const name = (e.target as HTMLInputElement).value;
                                    if (name) {
                                        // Prefix with parent path if not root
                                        const finalName = newItem.parentId === "Project" ? name : `${newItem.parentId.replace('Project/', '')}/${name}`;
                                        onAction?.("new_file", finalName);
                                    }
                                    setNewItem(null);
                                } else if (e.key === "Escape") {
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
                                onClick={() => {
                                    const input = document.querySelector('input[placeholder]') as HTMLInputElement;
                                    const name = input.value;
                                    if (name) {
                                        const finalName = newItem.parentId === "Project" ? name : `${newItem.parentId.replace('Project/', '')}/${name}`;
                                        onAction?.("new_file", finalName);
                                    }
                                    setNewItem(null);
                                }}
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
