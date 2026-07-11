"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import type { ProjectGraphData } from "@/lib/graph/graph-data";
import { buildTree, type TreeDir } from "./mindmap-tree";
import { RISK_STYLE, TYPE_STYLE, riskTier } from "./graph-theme";

interface MindmapViewProps {
    data: ProjectGraphData;
    projectName?: string;
    onNodeClick?: (fileId: string) => void;
}

function collectDirPaths(dir: TreeDir, depth: number, acc: Set<string>, maxDepth: number): void {
    if (depth <= maxDepth) acc.add(dir.path);
    for (const child of dir.dirs) collectDirPaths(child, depth + 1, acc, maxDepth);
}

export function MindmapView({ data, projectName = "Project", onNodeClick }: MindmapViewProps) {
    const tree = useMemo(() => buildTree(data.nodes, projectName), [data.nodes, projectName]);

    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const set = new Set<string>();
        collectDirPaths(tree, 0, set, 1); // expand root + first level by default
        return set;
    });

    const toggle = (path: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });

    const setAll = (open: boolean) => {
        if (!open) {
            setExpanded(new Set([""]));
            return;
        }
        const set = new Set<string>();
        collectDirPaths(tree, 0, set, 99);
        setExpanded(set);
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5 text-xs">
                <span className="text-zinc-500">{tree.fileCount} files</span>
                <div className="ml-auto flex gap-1">
                    <button
                        onClick={() => setAll(true)}
                        className="rounded border border-zinc-700 bg-zinc-800/70 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                    >
                        Expand all
                    </button>
                    <button
                        onClick={() => setAll(false)}
                        className="rounded border border-zinc-700 bg-zinc-800/70 px-2 py-1 text-zinc-300 hover:bg-zinc-700"
                    >
                        Collapse
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
                <DirNode dir={tree} depth={0} expanded={expanded} toggle={toggle} onNodeClick={onNodeClick} />
            </div>
        </div>
    );
}

interface DirNodeProps {
    dir: TreeDir;
    depth: number;
    expanded: Set<string>;
    toggle: (path: string) => void;
    onNodeClick?: (fileId: string) => void;
}

function DirNode({ dir, depth, expanded, toggle, onNodeClick }: DirNodeProps) {
    const isOpen = expanded.has(dir.path);
    const tier = riskTier(dir.maxRisk);

    return (
        <div>
            <button
                onClick={() => toggle(dir.path)}
                className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-white/5"
                style={{ paddingLeft: depth * 16 + 6 }}
            >
                <ChevronRight
                    className={"h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform " + (isOpen ? "rotate-90" : "")}
                />
                {isOpen ? (
                    <FolderOpen className="h-4 w-4 shrink-0 text-sky-400" />
                ) : (
                    <Folder className="h-4 w-4 shrink-0 text-sky-500/80" />
                )}
                <span className="truncate text-[13px] font-medium text-zinc-200">{dir.name}</span>
                <span className="ml-1 rounded bg-white/5 px-1.5 text-[10px] text-zinc-500">{dir.fileCount}</span>
                {dir.maxRisk > 45 && (
                    <span
                        className="ml-auto mr-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: RISK_STYLE[tier].color }}
                        title={`${RISK_STYLE[tier].label} in subtree`}
                    />
                )}
            </button>

            {isOpen && (
                <div className="relative">
                    {dir.dirs.map((child) => (
                        <DirNode
                            key={child.path}
                            dir={child}
                            depth={depth + 1}
                            expanded={expanded}
                            toggle={toggle}
                            onNodeClick={onNodeClick}
                        />
                    ))}
                    {dir.files.map((file) => {
                        const style = TYPE_STYLE[file.type];
                        const Icon = style.icon;
                        const fileTier = riskTier(file.riskScore);
                        return (
                            <button
                                key={file.id}
                                onClick={() => onNodeClick?.(file.fileId)}
                                title={file.id}
                                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-white/5"
                                style={{ paddingLeft: (depth + 1) * 16 + 22 }}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: style.accent }} />
                                <span className="truncate text-[12px] text-zinc-300">{file.name}</span>
                                {file.riskScore > 45 && (
                                    <span
                                        className="ml-auto mr-1 text-[10px] font-mono"
                                        style={{ color: RISK_STYLE[fileTier].color }}
                                    >
                                        {file.riskScore}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
