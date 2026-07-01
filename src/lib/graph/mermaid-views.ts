/**
 * Alternate Mermaid representations of a {@link ProjectGraph}.
 *
 * The Architecture tab historically rendered a single dependency `flowchart`
 * (see `mermaid-adapter.ts`). These adapters turn the *same* graph into other
 * diagram types so the user can view their project in different ways:
 *
 *   - `projectGraphToSequenceDiagram` — a layered request flow
 *     (Page → Component → Hook → API → Lib) as an ordered sequence.
 *   - `projectGraphToClassDiagram`    — files as classes with their exports.
 *   - `projectGraphToMindmap`         — the folder/file tree as a mindmap.
 *
 * All three are pure functions and share the graph the API route already
 * builds, so adding a view costs one extra string, not another crawl.
 *
 * Rendering constraints (see `diagram-viewer/mermaid-renderer.ts`):
 *   - `securityLevel: "strict"` — no click callbacks, HTML labels off.
 *   - `sanitizeSvg` strips `<foreignObject>` — labels must survive as plain
 *     SVG `<text>`, which they do for these diagram types.
 */

import { GraphNode, NodeType, ProjectGraph } from "./project-graph";
import { isGraphableSourcePath } from "@/lib/project-files";

/** Canonical top-down request-flow order for the architectural layers. */
const LAYER_ORDER: NodeType[] = ["page", "component", "hook", "api", "lib", "unknown"];

const LAYER_META: Record<NodeType, { label: string; icon: string; alias: string }> = {
    page: { label: "Pages", icon: "📄", alias: "PAGE" },
    component: { label: "Components", icon: "🧩", alias: "COMP" },
    hook: { label: "Hooks", icon: "🪝", alias: "HOOK" },
    api: { label: "API", icon: "🔌", alias: "API" },
    lib: { label: "Lib", icon: "📚", alias: "LIB" },
    unknown: { label: "Other", icon: "📦", alias: "OTHER" },
};

/** Verb describing an edge *into* the given layer, for sequence-message labels. */
const INBOUND_VERB: Record<NodeType, string> = {
    page: "routes to",
    component: "renders",
    hook: "uses hook",
    api: "calls",
    lib: "uses",
    unknown: "imports",
};

const TYPE_ICON: Record<NodeType, string> = {
    component: "🧩",
    api: "🔌",
    page: "📄",
    hook: "🪝",
    lib: "📚",
    unknown: "📦",
};

/** Deterministic FNV-1a-ish salt so generated ids are stable across renders. */
function pathSalt(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(36).slice(0, 4);
}

/** Only real source files participate in any view. */
function collectNodes(graph: ProjectGraph): Map<string, GraphNode> {
    const nodes = new Map<string, GraphNode>();
    for (const [id, node] of graph.nodes) {
        if (isGraphableSourcePath(id)) nodes.set(id, node);
    }
    return nodes;
}

function edgeDegrees(graph: ProjectGraph, present: Map<string, GraphNode>): Map<string, number> {
    const degree = new Map<string, number>();
    const bump = (key: string) => degree.set(key, (degree.get(key) ?? 0) + 1);
    for (const { from, to } of graph.edges) {
        if (!present.has(from) || !present.has(to)) continue;
        bump(from);
        bump(to);
    }
    return degree;
}

// ---------------------------------------------------------------------------
// 1. Sequence diagram — layered request flow.
// ---------------------------------------------------------------------------

/**
 * Aggregate every import edge into a message between architectural layers and
 * render them as a `sequenceDiagram`. Cross-file dependencies read top-down as
 * a request flowing Page → Component → Hook → API → Lib; intra-layer coupling
 * shows as a self-message. At most six participants, so it never explodes.
 */
export function projectGraphToSequenceDiagram(graph: ProjectGraph): string {
    const nodes = collectNodes(graph);

    const present = new Set<NodeType>();
    for (const node of nodes.values()) present.add(node.type);
    const layers = LAYER_ORDER.filter((layer) => present.has(layer));

    if (layers.length === 0) {
        return "sequenceDiagram\n    participant P as 📦 Project\n    Note over P: No source files to visualize yet";
    }

    // Count edges per (fromLayer → toLayer) pair.
    const counts = new Map<string, number>();
    for (const { from, to } of graph.edges) {
        const fromLayer = nodes.get(from)?.type;
        const toLayer = nodes.get(to)?.type;
        if (!fromLayer || !toLayer) continue;
        const key = `${fromLayer}>${toLayer}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    let out = "sequenceDiagram\n    autonumber\n";
    for (const layer of layers) {
        const meta = LAYER_META[layer];
        out += `    participant ${meta.alias} as ${meta.icon} ${meta.label}\n`;
    }

    const orderOf = (layer: NodeType) => LAYER_ORDER.indexOf(layer);
    const messages = [...counts.entries()]
        .map(([key, count]) => {
            const [from, to] = key.split(">") as [NodeType, NodeType];
            return { from, to, count };
        })
        .sort((a, b) => orderOf(a.from) - orderOf(b.from) || orderOf(a.to) - orderOf(b.to));

    for (const { from, to, count } of messages) {
        out += `    ${LAYER_META[from].alias}->>${LAYER_META[to].alias}: ${INBOUND_VERB[to]} (${count})\n`;
    }

    if (messages.length === 0) {
        out += `    Note over ${LAYER_META[layers[0]].alias}: No cross-file dependencies detected\n`;
    }

    return out;
}

// ---------------------------------------------------------------------------
// 2. Class diagram — files as classes with their exports.
// ---------------------------------------------------------------------------

const MAX_CLASS_NODES = 45;
const MAX_CLASS_EDGES = 120;
const MAX_CLASS_MEMBERS = 6;

/** Mermaid class id: must be a valid identifier and collision-free. */
function classId(filePath: string): string {
    return `c${pathSalt(filePath)}_${filePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/** Strip characters that break class labels / member lines. */
function sanitizeClassText(text: string): string {
    return text
        .replace(/["'`{}<>:]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Render the graph as a `classDiagram`: each file is a class stereotyped by its
 * type, its exports become members, and imports become `..>` dependencies.
 * Class diagrams grow fast, so this keeps the top-N nodes by degree + risk.
 */
export function projectGraphToClassDiagram(graph: ProjectGraph): { mermaid: string; truncated: boolean } {
    const nodes = collectNodes(graph);
    if (nodes.size === 0) {
        return { mermaid: "classDiagram\n    class Empty[\"No source files\"]", truncated: false };
    }

    const degree = edgeDegrees(graph, nodes);
    let ids = [...nodes.keys()];
    let truncated = false;

    if (ids.length > MAX_CLASS_NODES) {
        truncated = true;
        ids = ids
            .map((id) => ({ id, rank: (degree.get(id) ?? 0) * 10 + (nodes.get(id)?.riskScore ?? 0) }))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, MAX_CLASS_NODES)
            .map((entry) => entry.id);
    }

    const kept = new Set(ids);
    const idFor = new Map<string, string>();
    for (const id of ids) idFor.set(id, classId(id));

    let out = "classDiagram\n    direction LR\n";

    for (const id of ids) {
        const node = nodes.get(id)!;
        const cid = idFor.get(id)!;
        const label = sanitizeClassText(id.split("/").pop() || id) || "file";

        out += `    class ${cid}["${label}"]\n`;
        out += `    ${cid} : <<${node.type}>>\n`;

        for (const exported of node.exports.slice(0, MAX_CLASS_MEMBERS)) {
            const member = sanitizeClassText(exported);
            if (member) out += `    ${cid} : +${member}\n`;
        }
        const extra = node.exports.length - MAX_CLASS_MEMBERS;
        if (extra > 0) out += `    ${cid} : +${extra} more…\n`;
    }

    let edges = 0;
    const seen = new Set<string>();
    for (const { from, to } of graph.edges) {
        if (!kept.has(from) || !kept.has(to)) continue;
        const a = idFor.get(from)!;
        const b = idFor.get(to)!;
        if (a === b) continue;
        const key = `${a}>${b}`;
        if (seen.has(key)) continue;
        if (edges >= MAX_CLASS_EDGES) {
            truncated = true;
            break;
        }
        seen.add(key);
        out += `    ${a} ..> ${b}\n`;
        edges++;
    }

    return { mermaid: out, truncated };
}

// ---------------------------------------------------------------------------
// 3. Mindmap — the folder/file tree.
// ---------------------------------------------------------------------------

const MAX_MINDMAP_LINES = 160;
const MAX_FILES_PER_DIR = 14;

interface DirTree {
    dirs: Map<string, DirTree>;
    files: string[];
}

/** Strip characters mermaid mindmap treats as node-shape markers. */
function sanitizeMindmapText(text: string): string {
    return text.replace(/[()[\]{}`"]/g, "").replace(/\s+/g, " ").trim() || "·";
}

/**
 * Render the folder hierarchy as a `mindmap`. Mermaid mindmaps require exactly
 * one root and are indentation-sensitive, so this emits a single synthetic
 * root and two-space-per-level indentation, collapsing oversized folders.
 */
export function projectGraphToMindmap(graph: ProjectGraph, projectName = "Project"): string {
    const nodes = collectNodes(graph);

    const root: DirTree = { dirs: new Map(), files: [] };
    for (const id of nodes.keys()) {
        const parts = id.split("/");
        const file = parts.pop() || id;
        let cursor = root;
        for (const segment of parts) {
            if (!cursor.dirs.has(segment)) cursor.dirs.set(segment, { dirs: new Map(), files: [] });
            cursor = cursor.dirs.get(segment)!;
        }
        cursor.files.push(file);
    }

    let lines = 0;
    let out = "mindmap\n";
    out += `  root((📦 ${sanitizeMindmapText(projectName)}))\n`;
    lines++;

    const iconFor = (file: string): string => {
        const lower = file.toLowerCase();
        if (lower === "page.tsx" || lower === "page.ts" || lower === "layout.tsx") return TYPE_ICON.page;
        if (lower.startsWith("route.")) return TYPE_ICON.api;
        if (/^use[a-z]/i.test(lower)) return TYPE_ICON.hook;
        return "📄";
    };

    const walk = (tree: DirTree, depth: number): boolean => {
        const indent = "  ".repeat(depth + 2); // root sits at depth 0 / indent 2

        const dirNames = [...tree.dirs.keys()].sort((a, b) => a.localeCompare(b));
        for (const name of dirNames) {
            if (lines >= MAX_MINDMAP_LINES) {
                out += `${indent}…more\n`;
                lines++;
                return false;
            }
            out += `${indent}📁 ${sanitizeMindmapText(name)}\n`;
            lines++;
            if (!walk(tree.dirs.get(name)!, depth + 1)) return false;
        }

        const files = tree.files.sort((a, b) => a.localeCompare(b));
        const shown = files.slice(0, MAX_FILES_PER_DIR);
        for (const file of shown) {
            if (lines >= MAX_MINDMAP_LINES) {
                out += `${indent}…more\n`;
                lines++;
                return false;
            }
            out += `${indent}${iconFor(file)} ${sanitizeMindmapText(file)}\n`;
            lines++;
        }
        if (files.length > shown.length) {
            out += `${indent}…${files.length - shown.length} more files\n`;
            lines++;
        }
        return true;
    };

    walk(root, 0);
    return out;
}
