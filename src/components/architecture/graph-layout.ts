/**
 * Deterministic layered layout for the architecture graph.
 *
 * We don't pull in a heavyweight layout engine (dagre/elk). The architecture is
 * already meaningfully *layered* — Pages depend on Components depend on Hooks/
 * APIs depend on Libs — so a banded layout reads as a top-down request flow and
 * stays stable across renders (no physics, no randomness).
 *
 * Positions are absolute; React Flow provides pan/zoom so the band can be wider
 * than the viewport. Node dimensions are fixed per view so the layout is a pure
 * function of the graph.
 */

import type { GraphDataNode, GraphDataEdge } from "@/lib/graph/graph-data";
import { LAYER_ORDER } from "@/lib/graph/graph-data";
import type { NodeType } from "@/lib/graph/project-graph";

export interface PositionedNode {
    id: string;
    x: number;
    y: number;
    data: GraphDataNode;
}

export interface LayoutResult {
    nodes: PositionedNode[];
    width: number;
    height: number;
    /** Ordered, present layers with their vertical band centre (for lane labels). */
    lanes: Array<{ type: NodeType; y: number; count: number }>;
}

export interface LayoutOptions {
    nodeWidth: number;
    nodeHeight: number;
    /** Horizontal gap between nodes in a band. */
    gapX?: number;
    /** Vertical gap between bands. */
    gapY?: number;
    /** Max nodes per row before wrapping within a band. */
    perRow?: number;
}

const DEFAULTS = { gapX: 36, gapY: 120, perRow: 6 };

/**
 * Lay nodes out in horizontal bands ordered by architectural layer. Within a
 * band, nodes are ranked by total degree (busiest first) then name, and wrap
 * into multiple rows so no single band runs off the canvas.
 */
export function layeredLayout(
    nodes: GraphDataNode[],
    _edges: GraphDataEdge[],
    opts: LayoutOptions,
): LayoutResult {
    const gapX = opts.gapX ?? DEFAULTS.gapX;
    const gapY = opts.gapY ?? DEFAULTS.gapY;
    const perRow = opts.perRow ?? DEFAULTS.perRow;
    const { nodeWidth, nodeHeight } = opts;

    const byLayer = new Map<NodeType, GraphDataNode[]>();
    for (const node of nodes) {
        const bucket = byLayer.get(node.type) ?? [];
        bucket.push(node);
        byLayer.set(node.type, bucket);
    }

    const presentLayers = LAYER_ORDER.filter((layer) => (byLayer.get(layer)?.length ?? 0) > 0);

    const cellW = nodeWidth + gapX;
    const cellH = nodeHeight + 28; // row gap inside a band

    // The widest band drives the canvas width so every band can be centred.
    let maxRowNodes = 1;
    for (const layer of presentLayers) {
        maxRowNodes = Math.max(maxRowNodes, Math.min(byLayer.get(layer)!.length, perRow));
    }
    const width = maxRowNodes * cellW - gapX;

    const positioned: PositionedNode[] = [];
    const lanes: LayoutResult["lanes"] = [];
    let cursorY = 0;

    for (const layer of presentLayers) {
        const layerNodes = [...byLayer.get(layer)!].sort(
            (a, b) =>
                b.inDegree + b.outDegree - (a.inDegree + a.outDegree) ||
                a.name.localeCompare(b.name),
        );

        const rows = Math.ceil(layerNodes.length / perRow);
        const bandHeight = rows * cellH - (cellH - nodeHeight);
        lanes.push({ type: layer, y: cursorY + bandHeight / 2, count: layerNodes.length });

        layerNodes.forEach((node, i) => {
            const row = Math.floor(i / perRow);
            const col = i % perRow;
            const rowCount = Math.min(layerNodes.length - row * perRow, perRow);
            const rowWidth = rowCount * cellW - gapX;
            const rowStartX = (width - rowWidth) / 2;
            positioned.push({
                id: node.id,
                x: rowStartX + col * cellW,
                y: cursorY + row * cellH,
                data: node,
            });
        });

        cursorY += bandHeight + gapY;
    }

    return { nodes: positioned, width, height: cursorY - gapY, lanes };
}
