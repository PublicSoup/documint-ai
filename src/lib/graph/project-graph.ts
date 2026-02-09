
// import * as fs from "fs/promises"; // Removed
// import * as path from "path"; // Removed

export interface GraphNode {
    id: string; // File path relative to root
    imports: string[];
    exports: string[];
    type: "component" | "hook" | "lib" | "api" | "page" | "unknown";
}

export interface ProjectGraph {
    nodes: Map<string, GraphNode>;
    edges: { from: string; to: string }[];
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const EXCLUDE_DIRS = ['node_modules', '.next', '.git', 'dist', 'build'];

// EXTENSIONS constant moved inside or kept if used elsewhere, but for DB we might Filter in query
// For now, let's assume the caller filters or we filter here.

export async function buildProjectGraph(files: { path: string; content: string }[]): Promise<ProjectGraph> {
    const graph: ProjectGraph = {
        nodes: new Map(),
        edges: []
    };

    // 1. Parse all files into nodes
    for (const file of files) {
        // Skip node_modules etc if somehow they got in, though DB shouldn't have them usually
        if (file.path.includes('node_modules') || file.path.includes('.git')) continue;

        try {
            const node = parseFile(file.path, file.content || "");
            graph.nodes.set(file.path, node);
        } catch (e) {
            console.warn(`Failed to parse file ${file.path}:`, e);
        }
    }

    // 2. Build edges
    for (const [id, node] of graph.nodes) {
        for (const imp of node.imports) {
            // "Fuzzy" matching for MVP
            // If import is "./utils", we look for "utils.ts", "lib/utils.ts", etc.
            // A robust solution would resolve paths relative to `id`'s directory.

            // Attempt 1: Exact match (unlikely with extensions omitted)
            let target = graph.nodes.has(imp) ? imp : undefined;

            // Attempt 2: Try finding by suffix (e.g. import "utils" matches "src/lib/utils.ts")
            // This is very loose but works for visualization
            if (!target) {
                // Remove leading ./ or ../ for search
                const cleanImp = imp.replace(/^[\.\/]+/, '');
                target = Array.from(graph.nodes.keys()).find(k => {
                    // Check if file path ends with import (ignoring extension or adding one)
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

function parseFile(filePath: string, content: string): GraphNode {
    const imports: string[] = [];
    const exports: string[] = [];

    // Regex for imports
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+)|(?:\*\s+as\s+(\w+)))\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        // match[4] is the path
        imports.push(match[4]);
    }

    // Regex for exports
    const exportRegex = /export\s+(?:const|function|class|default)\s+(\w+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
    }

    // Determine type
    let type: GraphNode['type'] = 'unknown';
    if (filePath.includes('/components/')) type = 'component';
    else if (filePath.includes('/hooks/')) type = 'hook';
    else if (filePath.includes('/lib/')) type = 'lib';
    else if (filePath.includes('/api/') || filePath.includes('/app/') && filePath.includes('route.ts')) type = 'api';
    else if (filePath.includes('/app/') && filePath.includes('page.tsx')) type = 'page';

    return {
        id: filePath,
        imports,
        exports,
        type
    };
}

export function generateGraphSummary(graph: ProjectGraph): string {
    const componentCount = Array.from(graph.nodes.values()).filter(n => n.type === 'component').length;
    const apiCount = Array.from(graph.nodes.values()).filter(n => n.type === 'api').length;

    let summary = `Project Structure Check:\n`;
    summary += `- Components: ${componentCount}\n`;
    summary += `- API Routes: ${apiCount}\n`;
    summary += `- Total Files: ${graph.nodes.size}\n`;

    // Identify "Hub" files (many imports)
    const hubs = Array.from(graph.nodes.values())
        .sort((a, b) => b.imports.length - a.imports.length)
        .slice(0, 3);

    summary += `\nKey Hub Files (High Consistency):\n`;
    hubs.forEach(h => summary += `- ${h.id} (${h.imports.length} imports)\n`);

    return summary;
}
