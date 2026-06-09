/**
 * Project-level dependency graph builder.
 *
 * Given a flat list of { path, content } entries (one per file in the user's
 * workspace), this module extracts:
 *   - The `import ... from "..."` statements of each file (with proper alias
 *     and barrel-export resolution).
 *   - A rule-based, segment-aware file type classification
 *     (`api` / `page` / `component` / `hook` / `lib` / `unknown`).
 *   - A risk score in [0, 100] derived from SLOC, dependency count, control
 *     flow density, and export surface.
 *   - A stable cluster key for each file so Mermaid subgraphs don't shift
 *     between renders.
 *
 * The output is consumed by `lib/graph/mermaid-adapter.ts` to emit Mermaid
 * syntax that the dashboard's Architecture tab renders with `mermaid.render`.
 */

export type NodeType = "component" | "hook" | "lib" | "api" | "page" | "unknown";

export interface GraphNode {
    /** File path relative to the workspace root (e.g. "src/components/Button.tsx"). */
    id: string;
    imports: string[];
    exports: string[];
    type: NodeType;
    /** 0-100. Higher = more complex. Thresholds: >75 high, >45 med, else low. */
    riskScore: number;
    folder: string;
    /** Stable cluster key for the Mermaid adapter (deterministic hash of the folder). */
    subgraphKey: string;
}

export interface ProjectGraph {
    nodes: Map<string, GraphNode>;
    edges: Array<{ from: string; to: string }>;
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const EXCLUDE_DIRS = ["node_modules", ".next", ".git", "dist", "build", "out", ".turbo"];
const MAX_IMPORTS_PER_NODE = 50;

// Risk thresholds (kept in sync with mermaid-adapter.ts).
export const RISK_HIGH = 75;
export const RISK_MED = 45;

/**
 * Quick FNV-1a-style 32-bit hash. Stable across runs, cheap to compute,
 * and good enough to act as a deterministic cluster key.
 */
function stableHash(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(36);
}

/**
 * Rule-based type classifier. Walks the path segments in order so the *most
 * specific* match wins (e.g. a file in `app/api/foo/route.ts` is `api`, not
 * `page`).
 */
export function classifyFileType(filePath: string): NodeType {
    const segments = filePath.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "";
    const lowerLast = last.toLowerCase();

    // 1. Next.js page/layout files. These win over `app/` containment.
    if (lowerLast === "page.tsx" || lowerLast === "page.jsx" ||
        lowerLast === "page.ts"  || lowerLast === "page.js"  ||
        lowerLast === "layout.tsx" || lowerLast === "layout.jsx" ||
        lowerLast === "layout.ts"  || lowerLast === "layout.js") {
        return "page";
    }

    // 2. API routes — either an `api/` segment in the path, or a file named
    //    `route.ts` / `route.js`. The latter also catches `app/foo/route.ts`.
    if (segments.includes("api")) return "api";
    if (lowerLast === "route.ts" || lowerLast === "route.js" ||
        lowerLast === "route.tsx" || lowerLast === "route.jsx") {
        return "api";
    }

    // 3. Hooks — a `hooks` segment, or filename starting with `use`.
    if (segments.includes("hooks") || segments.includes("hook")) return "hook";
    if (/^use[A-Z0-9]/.test(lowerLast)) return "hook";

    // 4. Library / utilities / services.
    if (segments.includes("lib") || segments.includes("libs") ||
        segments.includes("utils") || segments.includes("services") ||
        segments.includes("shared") || segments.includes("helpers")) {
        return "lib";
    }

    // 5. Components — but exclude the `ui/` subfolder which holds primitives.
    if (segments.includes("components") || segments.includes("component")) {
        const compIdx = segments.lastIndexOf("components");
        if (compIdx === -1 || segments[compIdx + 1] !== "ui") {
            return "component";
        }
    }

    return "unknown";
}

/**
 * Try to resolve an import path to a known file in the graph.
 * Handles missing extensions and barrel exports (index.ts).
 */
function resolveImportPath(allKeys: string[], importPath: string): string | undefined {
    if (allKeys.includes(importPath)) return importPath;

    for (const ext of EXTENSIONS) {
        const withExt = importPath + ext;
        if (allKeys.includes(withExt)) return withExt;
    }

    // Barrel export: import from directory → resolve to index.ts/tsx/js
    for (const ext of EXTENSIONS) {
        const indexPath = importPath + "/index" + ext;
        if (allKeys.includes(indexPath)) return indexPath;
    }

    return undefined;
}

function shouldSkipDir(filePath: string): boolean {
    return EXCLUDE_DIRS.some((dir) =>
        filePath === dir || filePath.startsWith(dir + "/") || filePath.includes("/" + dir + "/"),
    );
}

/**
 * Build the project graph for a set of files. Pure function aside from
 * `console.warn` for parse failures.
 */
export async function buildProjectGraph(files: Array<{ path: string; content: string }>): Promise<ProjectGraph> {
    const graph: ProjectGraph = {
        nodes: new Map(),
        edges: [],
    };

    // 1. Parse all files into nodes.
    for (const file of files) {
        if (shouldSkipDir(file.path)) continue;

        try {
            const node = parseFile(file.path, file.content ?? "");
            graph.nodes.set(file.path, node);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            console.warn(`[project-graph] Failed to parse ${file.path}: ${reason}`);
        }
    }

    // 2. Build edges with smart import resolution.
    const allKeys = Array.from(graph.nodes.keys());

    for (const [id, node] of graph.nodes) {
        const importerDir = id.includes("/") ? id.split("/").slice(0, -1).join("/") : "";

        for (const imp of node.imports) {
            // Skip node_modules / external packages.
            if (!imp.startsWith(".") && !imp.startsWith("@/") && !imp.startsWith("~") && !imp.startsWith("#")) {
                continue;
            }

            let target: string | undefined;

            // Strategy 1: Resolve @/ alias (Next.js convention → maps to src/).
            if (imp.startsWith("@/")) {
                const aliasPath = imp.replace(/^@\//, "src/");
                target = resolveImportPath(allKeys, aliasPath);
            }

            // Strategy 2: Resolve relative imports (./foo, ../bar).
            if (!target && imp.startsWith(".")) {
                const parts = importerDir.split("/");
                const impParts = imp.split("/");

                const resolvedParts = [...parts];
                for (const seg of impParts) {
                    if (seg === "..") resolvedParts.pop();
                    else if (seg !== ".") resolvedParts.push(seg);
                }
                const resolvedPath = resolvedParts.join("/");
                target = resolveImportPath(allKeys, resolvedPath);
            }

            // Strategy 3: Fuzzy suffix match (fallback).
            if (!target) {
                const cleanImp = imp.replace(/^[@\.\/~#]+/, "");
                target = allKeys.find((k) => {
                    const kWithoutExt = k.replace(/\.[^/.]+$/, "");
                    return k.endsWith(cleanImp) || kWithoutExt.endsWith(cleanImp);
                });
            }

            if (target && target !== id) {
                graph.edges.push({ from: id, to: target });
            }
        }
    }

    return graph;
}

/**
 * Parse a single file into a `GraphNode`. Strips comments before metric
 * calculations to keep the risk score meaningful.
 */
function parseFile(filePath: string, content: string): GraphNode {
    const imports: string[] = [];
    const exports: string[] = [];

    // Strip comments for more accurate metric calculation.
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

    // Robust regex for ESM imports (handles multiline and mixed styles).
    const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(cleanContent)) !== null) {
        imports.push(match[1]);
    }
    // Also catch side-effect imports: import "foo".
    const sideEffectImportRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectImportRegex.exec(cleanContent)) !== null) {
        if (!imports.includes(match[1])) imports.push(match[1]);
    }

    // Capture named and default exports.
    const exportRegex = /export\s+(?:const|function|class|type|interface|enum|default)\s+(\w+)/g;
    while ((match = exportRegex.exec(cleanContent)) !== null) {
        exports.push(match[1]);
    }

    const type: NodeType = classifyFileType(filePath);

    /**
     * Enterprise Complexity Algorithm (Risk Score 0-100).
     * Factors:
     *   1. Volumetric Weight (SLOC)        — up to 25
     *   2. Dependency Gravity (imports)    — up to 25
     *   3. Logic Density (control flow)    — up to 30
     *   4. Encapsulation Quality (exports) — up to 20 (penalty for low export count)
     */
    const lines = content.split("\n").length;
    const controlKeywords = (
        cleanContent.match(/\b(if|else|switch|case|for|while|try|catch|map|filter|reduce|await|async)\b/g) ?? []
    ).length;

    const slocFactor = Math.min((lines / 800) * 25, 25);
    const dependencyFactor = Math.min((imports.length / 25) * 25, 25);
    const densityFactor = Math.min((controlKeywords / 30) * 30, 30);
    const encapsulationFactor = exports.length === 0 ? 20 : Math.max(0, 20 - exports.length * 2);

    const riskScore = Math.min(
        Math.round(slocFactor + dependencyFactor + densityFactor + encapsulationFactor),
        100,
    );

    const folderParts = filePath.split("/");
    const folder = folderParts.length > 1 ? folderParts.slice(0, -1).join("/") : "root";
    const subgraphKey = `cluster_${stableHash(folder)}`;

    return {
        id: filePath,
        imports: Array.from(new Set(imports)).slice(0, MAX_IMPORTS_PER_NODE),
        exports: Array.from(new Set(exports)),
        type,
        riskScore,
        folder,
        subgraphKey,
    };
}

export function generateGraphSummary(graph: ProjectGraph): string {
    const componentCount = Array.from(graph.nodes.values()).filter((n) => n.type === "component").length;
    const apiCount = Array.from(graph.nodes.values()).filter((n) => n.type === "api").length;
    const pageCount = Array.from(graph.nodes.values()).filter((n) => n.type === "page").length;
    const hookCount = Array.from(graph.nodes.values()).filter((n) => n.type === "hook").length;

    let summary = `Project Structure Check:\n`;
    summary += `- Components: ${componentCount}\n`;
    summary += `- Pages: ${pageCount}\n`;
    summary += `- Hooks: ${hookCount}\n`;
    summary += `- API Routes: ${apiCount}\n`;
    summary += `- Total Files: ${graph.nodes.size}\n`;
    summary += `- Total Edges: ${graph.edges.length}\n`;

    // Identify "hub" files (most-imported).
    const incoming = new Map<string, number>();
    for (const edge of graph.edges) {
        incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }
    const hubs = Array.from(incoming.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    summary += `\nKey Hub Files (most-imported):\n`;
    for (const [id, count] of hubs) {
        summary += `- ${id} (${count} importers)\n`;
    }

    return summary;
}