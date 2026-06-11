import { ProjectGraph, GraphNode, RISK_HIGH, RISK_MED } from "./project-graph";
import { isGraphableSourcePath } from "@/lib/project-files";

export interface MermaidGraphResult {
    mermaid: string;
    nodeMap: Record<string, string>;
    renderedNodes: number;
    renderedEdges: number;
    truncated: boolean;
}

/**
 * Maximum number of nodes that the adapter will render. Larger graphs are
 * truncated to the top-N most-connected nodes plus a single collapsed
 * "more" subgraph so Mermaid doesn't choke.
 */
const MAX_RENDERED_NODES = 150;
const MAX_RENDERED_EDGES = 600;

const TYPE_ICONS: Record<GraphNode["type"], string> = {
    component: "🧩",
    api: "🔌",
    page: "📄",
    hook: "🪝",
    lib: "📚",
    unknown: "📦",
};

const RISK_ICON: Record<"high" | "med" | "low", string> = {
    high: "🔥",
    med: "⚠️",
    low: "✅",
};

function riskBucket(score: number): "high" | "med" | "low" {
    if (score > RISK_HIGH) return "high";
    if (score > RISK_MED) return "med";
    return "low";
}

/**
 * Sanitize a string for use inside mermaid double-quoted labels.
 * Strips characters that break mermaid syntax (quotes, brackets, semicolons).
 */
function sanitizeLabel(str: string): string {
    return str
        .replace(/"/g, "")
        .replace(/'/g, "")
        .replace(/[\[\]{}();]/g, "")
        .replace(/`/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Sanitize a string for use inside mermaid click handler arguments.
 * Escapes double quotes so mermaid can parse the callback.
 */
function sanitizeClickArg(str: string): string {
    return str.replace(/"/g, "#quot;");
}

/**
 * Mermaid-friendly node id: the path can contain `/`, `.`, `-`. We replace
 * any non-alphanumeric run with `_` and prefix with `n` so it can't start
 * with a digit (mermaid identifiers must be valid CSS-like identifiers).
 *
 * We also pre-pend a small deterministic suffix derived from the path hash
 * to *prevent collisions* between e.g. `lib/utils.ts` and `lib/utils.tsx`
 * which would otherwise sanitize to the same string.
 */
function safeNodeId(filePath: string, collisionSalt: string): string {
    const cleaned = filePath.replace(/[^a-zA-Z0-9]/g, "_");
    return `n${collisionSalt}_${cleaned}`;
}

/**
 * A monotonic counter used to make `safeNodeId` produce unique ids even when
 * two paths sanitize to the same string. We seed it with a hash of the path
 * so the resulting ids are stable across renders.
 */
function pathSalt(filePath: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < filePath.length; i++) {
        hash ^= filePath.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(36).slice(0, 4);
}

/**
 * Filter out files that aren't real source code and would pollute the graph.
 * Files like `"use client";` or single-line directives should be skipped.
 */
function isValidSourceFile(filePath: string): boolean {
    return isGraphableSourcePath(filePath);
}

function rankKey(node: GraphNode, edgeCount: number): number {
    // Higher rank = more important to keep when truncating.
    return edgeCount * 10 + node.riskScore;
}

/**
 * Convert a project graph into a Mermaid `flowchart TD` string.
 *
 * Features:
 *  - One subgraph per folder (stable cluster keys via `subgraphKey`).
 *  - Color-coded nodes by type and risk-heatmapped borders.
 *  - Truncation to `MAX_RENDERED_NODES` (top-N by degree + risk).
 *  - Stable node ids that don't collide on path sanitization.
 *  - Click handlers that call back into the React viewer with the file path.
 *  - A "summary" node that links to the top 3 hub files.
 */
export function projectGraphToMermaidResult(graph: ProjectGraph): MermaidGraphResult {
    let mermaid = "flowchart TD\n";
    const nodeMap: Record<string, string> = {};

    // Dark-mode optimized color palette.
    mermaid += "    classDef component fill:#1e3a5f,stroke:#3b82f6,stroke-width:2px,color:#93c5fd,rx:8,ry:8\n";
    mermaid += "    classDef page fill:#1a3a2a,stroke:#22c55e,stroke-width:2px,color:#86efac,rx:8,ry:8\n";
    mermaid += "    classDef api fill:#3b2a1a,stroke:#f97316,stroke-width:2px,color:#fdba74,rx:8,ry:8\n";
    mermaid += "    classDef lib fill:#2d1a3f,stroke:#a855f7,stroke-width:2px,color:#c4b5fd,rx:8,ry:8\n";
    mermaid += "    classDef hook fill:#3b3a1a,stroke:#eab308,stroke-width:2px,color:#fde047,rx:8,ry:8\n";
    mermaid += "    classDef unknown fill:#1e1e2e,stroke:#6b7280,stroke-width:1px,color:#9ca3af,rx:8,ry:8\n";

    // Risk heatmap classes (border-only).
    mermaid += "    classDef riskLow stroke:#10b981,stroke-width:2px\n";
    mermaid += "    classDef riskMed stroke:#f59e0b,stroke-width:4px\n";
    mermaid += "    classDef riskHigh stroke:#ef4444,stroke-width:6px\n";
    mermaid += "    classDef summary fill:#1e1b4b,stroke:#6366f1,stroke-width:3px,color:#c7d2fe,rx:12,ry:12\n\n";

    // Group nodes by folder, filtering out invalid entries.
    const folderGroups = new Map<string, string[]>();
    for (const [id, node] of graph.nodes) {
        if (!isValidSourceFile(id)) continue;
        const folder = node.folder || "root";
        if (!folderGroups.has(folder)) folderGroups.set(folder, []);
        folderGroups.get(folder)!.push(id);
    }

    if (folderGroups.size === 0) {
        return {
            mermaid: `flowchart TD
    empty["📭 No source files found"]:::unknown
    empty --- hint["Upload project source files to see your architecture"]:::unknown`,
            nodeMap,
            renderedNodes: 0,
            renderedEdges: 0,
            truncated: false,
        };
    }

    // Compute degree per node so we can rank for truncation.
    const degree = new Map<string, number>();
    const bump = (key: string) => degree.set(key, (degree.get(key) ?? 0) + 1);
    for (const { from, to } of graph.edges) {
        if (!isValidSourceFile(from) || !isValidSourceFile(to)) continue;
        bump(from);
        bump(to);
    }

    // If we have too many nodes, keep the top N by (degree + risk).
    let renderedIds: Set<string>;
    let truncated = false;
    if (graph.nodes.size > MAX_RENDERED_NODES) {
        truncated = true;
        const ranked = Array.from(graph.nodes.entries())
            .filter(([id]) => isValidSourceFile(id))
            .map(([id, node]) => ({ id, node, rank: rankKey(node, degree.get(id) ?? 0) }))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, MAX_RENDERED_NODES)
            .map((r) => r.id);
        renderedIds = new Set(ranked);
    } else {
        renderedIds = new Set(
            Array.from(graph.nodes.keys()).filter((id) => isValidSourceFile(id)),
        );
    }

    // Group rendered nodes by their stable cluster key.
    const clusterGroups = new Map<string, { folder: string; nodeIds: string[] }>();
    for (const id of renderedIds) {
        const node = graph.nodes.get(id);
        if (!node) continue;
        const key = node.subgraphKey;
        if (!clusterGroups.has(key)) {
            clusterGroups.set(key, { folder: node.folder || "root", nodeIds: [] });
        }
        clusterGroups.get(key)!.nodeIds.push(id);
    }

    // Emit subgraphs in deterministic order (sort by folder label).
    const sortedClusters = Array.from(clusterGroups.entries()).sort(
        (a, b) => a[1].folder.localeCompare(b[1].folder),
    );

    for (const [clusterKey, { folder, nodeIds }] of sortedClusters) {
        const folderLabel = folder === "root" ? "📦 Project Root" : `📁 ${sanitizeLabel(folder)}`;

        mermaid += `    subgraph ${clusterKey} ["${folderLabel}"]\n`;
        mermaid += `        direction TB\n`;

        for (const id of nodeIds) {
            const node = graph.nodes.get(id);
            if (!node) continue;

            const safeId = safeNodeId(id, pathSalt(id));
            const rawFilename = id.split("/").pop() || id;
            const filename = sanitizeLabel(rawFilename);
            const bucket = riskBucket(node.riskScore);

            const label = `${TYPE_ICONS[node.type]} ${filename} ${RISK_ICON[bucket]}`;
            mermaid += `        ${safeId}["${sanitizeLabel(label)}"]:::${node.type}\n`;
            mermaid += `        class ${safeId} risk${bucket.charAt(0).toUpperCase() + bucket.slice(1)}\n`;
            mermaid += `        click ${safeId} call mermaidNodeClick("${sanitizeClickArg(id)}")\n`;
            nodeMap[safeId] = id;
        }
        mermaid += `    end\n\n`;
    }

    // Truncated notice.
    if (truncated) {
        const hidden = graph.nodes.size - renderedIds.size;
        const summaryId = safeNodeId("__summary__", "0000");
        mermaid += `    ${summaryId}["…and ${hidden} more files (most-connected shown)"]:::summary\n\n`;
    }

    // Emit edges (only between rendered nodes, capped at MAX_RENDERED_EDGES).
    let edgeCount = 0;
    const seen = new Set<string>();
    for (const edge of graph.edges) {
        if (!renderedIds.has(edge.from) || !renderedIds.has(edge.to)) continue;
        if (edgeCount >= MAX_RENDERED_EDGES) break;
        const fromSafe = safeNodeId(edge.from, pathSalt(edge.from));
        const toSafe = safeNodeId(edge.to, pathSalt(edge.to));
        if (fromSafe === toSafe) continue;

        // Dedupe parallel edges so the graph doesn't become spaghetti.
        const key = `${fromSafe}->${toSafe}`;
        if (seen.has(key)) continue;
        seen.add(key);

        mermaid += `    ${fromSafe} --> ${toSafe}\n`;
        edgeCount++;
    }

    // Top-3 hub summary node — links to the most-imported files.
    const incoming = new Map<string, number>();
    for (const { from, to } of graph.edges) {
        if (!renderedIds.has(from) || !renderedIds.has(to)) continue;
        incoming.set(to, (incoming.get(to) ?? 0) + 1);
    }
    const topHubs = Array.from(incoming.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    if (topHubs.length > 0) {
        const summaryId = safeNodeId("__hubs__", "0001");
        mermaid += `\n    ${summaryId}["⭐ Top Hubs"]:::summary\n`;
        for (const [hubPath] of topHubs) {
            const hubSafe = safeNodeId(hubPath, pathSalt(hubPath));
            mermaid += `    ${summaryId} --> ${hubSafe}\n`;
        }
    }

    return {
        mermaid,
        nodeMap,
        renderedNodes: renderedIds.size,
        renderedEdges: edgeCount,
        truncated,
    };
}

export function projectGraphToMermaid(graph: ProjectGraph): string {
    return projectGraphToMermaidResult(graph).mermaid;
}