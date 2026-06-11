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

import { getProjectPathExtension, isGraphableSourcePath, normalizeProjectPath } from "@/lib/project-files";

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

const RESOLVABLE_EXTENSIONS = [
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
    ".json", ".css", ".scss", ".sass", ".less", ".mdx",
];
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
    const segments = filePath.toLowerCase().split("/").filter(Boolean);
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
    if (segments.includes("api") || filePath.toLowerCase().includes("/pages/api/")) return "api";
    if (lowerLast === "route.ts" || lowerLast === "route.js" ||
        lowerLast === "route.tsx" || lowerLast === "route.jsx") {
        return "api";
    }

    // 3. Hooks — a `hooks` segment, or filename starting with `use`.
    if (segments.includes("hooks") || segments.includes("hook")) return "hook";
    if (/^use[a-z0-9]/i.test(lowerLast)) return "hook";

    // 4. Library / utilities / services.
    if (segments.includes("lib") || segments.includes("libs") ||
        segments.includes("utils") || segments.includes("services") ||
        segments.includes("shared") || segments.includes("helpers") ||
        segments.includes("config") || segments.includes("constants")) {
        return "lib";
    }

    // 5. Components — but exclude the `ui/` subfolder which holds primitives.
    if (segments.includes("components") || segments.includes("component") || segments.includes("ui")) {
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
function resolveImportPath(allKeys: Set<string>, importPath: string): string | undefined {
    const normalized = normalizeProjectPath(importPath);
    if (!normalized) return undefined;
    if (allKeys.has(normalized)) return normalized;

    for (const ext of RESOLVABLE_EXTENSIONS) {
        const withExt = normalized + ext;
        if (allKeys.has(withExt)) return withExt;
    }

    // Barrel export: import from directory → resolve to index.ts/tsx/js
    for (const ext of RESOLVABLE_EXTENSIONS) {
        const indexPath = normalized + "/index" + ext;
        if (allKeys.has(indexPath)) return indexPath;
    }

    return undefined;
}

function inferPackageName(files: Array<{ path: string; content: string }>): string | null {
    const packageJson = files.find((file) => file.path.endsWith("package.json"));
    if (!packageJson) return null;
    try {
        const parsed = JSON.parse(packageJson.content) as { name?: unknown };
        return typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null;
    } catch {
        return null;
    }
}

function inferAliasCandidates(files: Array<{ path: string; content: string }>): Map<string, string[]> {
    const aliases = new Map<string, string[]>([
        ["@/", ["src/", ""]],
        ["~/", ["src/", ""]],
        ["#", ["src/", ""]],
    ]);

    for (const configName of ["tsconfig.json", "jsconfig.json"]) {
        const config = files.find((file) => file.path.endsWith(configName));
        if (!config) continue;
        try {
            const parsed = JSON.parse(config.content) as {
                compilerOptions?: { baseUrl?: unknown; paths?: Record<string, string[]> };
            };
            const baseUrl = typeof parsed.compilerOptions?.baseUrl === "string"
                ? parsed.compilerOptions.baseUrl.replace(/^\.\/?/, "").replace(/\/$/, "")
                : "";
            const paths = parsed.compilerOptions?.paths ?? {};
            for (const [aliasPattern, targets] of Object.entries(paths)) {
                const aliasPrefix = aliasPattern.replace(/\*.*$/, "");
                if (!aliasPrefix) continue;
                const roots = targets
                    .map((target) => `${baseUrl ? `${baseUrl}/` : ""}${target.replace(/\*.*$/, "")}`)
                    .map((target) => target.replace(/^\.\/?/, ""));
                aliases.set(aliasPrefix, Array.from(new Set([...(aliases.get(aliasPrefix) ?? []), ...roots])));
            }
        } catch {
            // Ignore malformed project configs; graph generation should degrade gracefully.
        }
    }

    return aliases;
}

function resolveBareOrAliasImport(
    allKeys: Set<string>,
    importPath: string,
    aliases: Map<string, string[]>,
    packageName: string | null,
): string | undefined {
    for (const [alias, roots] of aliases) {
        if (!importPath.startsWith(alias)) continue;
        const suffix = importPath.slice(alias.length);
        for (const root of roots) {
            const candidate = `${root}${suffix}`.replace(/^\/+/, "");
            const target = resolveImportPath(allKeys, candidate);
            if (target) return target;
        }
    }

    if (packageName && importPath.startsWith(`${packageName}/`)) {
        return resolveImportPath(allKeys, importPath.slice(packageName.length + 1));
    }

    return undefined;
}

function resolveRelativeImport(allKeys: Set<string>, importerDir: string, importPath: string): string | undefined {
    const parts = importerDir ? importerDir.split("/") : [];
    for (const seg of importPath.split("/")) {
        if (seg === "..") parts.pop();
        else if (seg !== ".") parts.push(seg);
    }
    return resolveImportPath(allKeys, parts.join("/"));
}

function resolveFuzzyImport(allKeys: string[], importPath: string): string | undefined {
    const cleanImp = importPath.replace(/^[@.\/~#]+/, "");
    if (!cleanImp || cleanImp.length < 3) return undefined;

    return allKeys.find((key) => {
        const keyWithoutExt = key.replace(/\.[^/.]+$/, "");
        return key.endsWith(cleanImp) || keyWithoutExt.endsWith(cleanImp);
    });
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
    const normalizedFiles = files
        .map((file) => ({ ...file, path: normalizeProjectPath(file.path) ?? "" }))
        .filter((file) => file.path && isGraphableSourcePath(file.path));

    for (const file of files) {
        const normalizedPath = normalizeProjectPath(file.path);
        if (!normalizedPath || !isGraphableSourcePath(normalizedPath)) continue;

        try {
            const node = parseFile(normalizedPath, file.content ?? "");
            graph.nodes.set(normalizedPath, node);
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            console.warn(`[project-graph] Failed to parse ${normalizedPath}: ${reason}`);
        }
    }

    // 2. Build edges with smart import resolution.
    const allKeys = Array.from(graph.nodes.keys());
    const allKeySet = new Set(allKeys);
    const aliases = inferAliasCandidates(normalizedFiles);
    const packageName = inferPackageName(normalizedFiles);
    const seenEdges = new Set<string>();

    for (const [id, node] of graph.nodes) {
        const importerDir = id.includes("/") ? id.split("/").slice(0, -1).join("/") : "";

        for (const imp of node.imports) {
            // Skip node_modules / external packages.
            let target: string | undefined;

            // Strategy 1: Resolve relative imports (./foo, ../bar).
            if (imp.startsWith(".")) target = resolveRelativeImport(allKeySet, importerDir, imp);

            // Strategy 2: Resolve project aliases and package self-imports.
            if (!target) target = resolveBareOrAliasImport(allKeySet, imp, aliases, packageName);

            // Strategy 3: Fuzzy suffix match for partially uploaded projects.
            if (!target) target = resolveFuzzyImport(allKeys, imp);

            if (target && target !== id) {
                const edgeKey = `${id}->${target}`;
                if (!seenEdges.has(edgeKey)) {
                    seenEdges.add(edgeKey);
                    graph.edges.push({ from: id, to: target });
                }
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

    // Robust regexes for common dependency declarations. This deliberately
    // avoids full AST parsing so graph generation remains cheap and resilient.
    const importRegex = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(cleanContent)) !== null) {
        imports.push(match[1]);
    }
    // Also catch side-effect imports: import "foo".
    const sideEffectImportRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectImportRegex.exec(cleanContent)) !== null) {
        if (!imports.includes(match[1])) imports.push(match[1]);
    }

    const exportFromRegex = /export\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = exportFromRegex.exec(cleanContent)) !== null) {
        imports.push(match[1]);
    }

    const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(cleanContent)) !== null) {
        imports.push(match[1]);
    }

    const dynamicImportRegex = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(cleanContent)) !== null) {
        imports.push(match[1]);
    }

    if ([".css", ".scss", ".sass", ".less"].includes(getProjectPathExtension(filePath))) {
        const cssImportRegex = /@import\s+(?:url\()?['"]([^'"]+)['"]/g;
        while ((match = cssImportRegex.exec(cleanContent)) !== null) {
            imports.push(match[1]);
        }
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