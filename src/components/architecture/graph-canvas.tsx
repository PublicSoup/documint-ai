"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    type Edge,
    type Node,
    type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ProjectGraphData } from "@/lib/graph/graph-data";
import { layeredLayout } from "./graph-layout";
import { FILE_NODE_SIZE, FileNode, type FileNodeData } from "./nodes/file-node";
import { TYPE_STYLE } from "./graph-theme";

const nodeTypes = { file: FileNode };

export type CanvasVariant = "dependency" | "class";

interface GraphCanvasProps {
    data: ProjectGraphData;
    variant: CanvasVariant;
    /** Ids that pass the active filter; others are hidden. Undefined = show all. */
    visibleIds?: Set<string>;
    onNodeClick?: (fileId: string) => void;
}

function GraphCanvasInner({ data, variant, visibleIds, onNodeClick }: GraphCanvasProps) {
    const { fitView } = useReactFlow();
    const [hovered, setHovered] = useState<string | null>(null);

    const nodes = useMemo(
        () => (visibleIds ? data.nodes.filter((n) => visibleIds.has(n.id)) : data.nodes),
        [data.nodes, visibleIds],
    );
    const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
    const edges = useMemo(
        () => data.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)),
        [data.edges, nodeIds],
    );

    const layout = useMemo(() => {
        const size = FILE_NODE_SIZE[variant];
        return layeredLayout(nodes, edges, {
            nodeWidth: size.width,
            nodeHeight: size.height,
            perRow: variant === "class" ? 5 : 6,
        });
    }, [nodes, edges, variant]);

    // Neighbours of the hovered node, for focus highlighting.
    const neighbours = useMemo(() => {
        if (!hovered) return null;
        const set = new Set<string>([hovered]);
        for (const e of edges) {
            if (e.from === hovered) set.add(e.to);
            if (e.to === hovered) set.add(e.from);
        }
        return set;
    }, [hovered, edges]);

    const rfNodes = useMemo<Node<FileNodeData>[]>(
        () =>
            layout.nodes.map((pos) => ({
                id: pos.id,
                type: "file",
                position: { x: pos.x, y: pos.y },
                draggable: false,
                data: {
                    ...pos.data,
                    variant,
                    dimmed: neighbours ? !neighbours.has(pos.id) : false,
                    highlighted: neighbours ? neighbours.has(pos.id) : false,
                },
            })),
        [layout.nodes, variant, neighbours],
    );

    const rfEdges = useMemo<Edge[]>(
        () =>
            edges.map((e) => {
                const active = neighbours ? neighbours.has(e.from) && neighbours.has(e.to) : false;
                const accent = TYPE_STYLE[data.nodes.find((n) => n.id === e.to)?.type ?? "unknown"].accent;
                return {
                    id: `${e.from}__${e.to}`,
                    source: e.from,
                    target: e.to,
                    animated: active,
                    style: {
                        stroke: active ? accent : "rgba(99, 102, 106, 0.35)",
                        strokeWidth: active ? 2 : 1,
                    },
                };
            }),
        [edges, neighbours, data.nodes],
    );

    // Re-fit whenever the rendered set changes (variant switch, filter change).
    const fitSignature = `${variant}:${rfNodes.length}`;
    useEffect(() => {
        const t = setTimeout(() => fitView({ padding: 0.15, duration: 300, maxZoom: 1.1 }), 60);
        return () => clearTimeout(t);
    }, [fitSignature, fitView]);

    const handleNodeClick = useCallback<NodeMouseHandler>(
        (_, node) => {
            const fileId = (node.data as FileNodeData).fileId;
            if (fileId) onNodeClick?.(fileId);
        },
        [onNodeClick],
    );

    if (rfNodes.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No files match the current filters.
            </div>
        );
    }

    return (
        <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
            minZoom={0.15}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onNodeClick={handleNodeClick}
            onNodeMouseEnter={(_, n) => setHovered(n.id)}
            onNodeMouseLeave={() => setHovered(null)}
            className="bg-transparent"
        >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.05)" />
            <Controls
                showInteractive={false}
                className="!border-zinc-700 !bg-zinc-900/90 [&>button]:!border-zinc-700 [&>button]:!bg-zinc-800 [&>button]:!fill-zinc-300 [&>button:hover]:!bg-zinc-700"
            />
            <MiniMap
                pannable
                zoomable
                bgColor="rgba(9,9,11,0.85)"
                maskColor="rgba(0,0,0,0.55)"
                nodeColor={(n) => TYPE_STYLE[(n.data as FileNodeData).type].accent}
                nodeStrokeWidth={0}
                className="!bottom-3 !right-3 !border !border-zinc-700 !bg-zinc-900/80"
            />
        </ReactFlow>
    );
}

export function GraphCanvas(props: GraphCanvasProps) {
    return (
        <ReactFlowProvider>
            <GraphCanvasInner {...props} />
        </ReactFlowProvider>
    );
}
