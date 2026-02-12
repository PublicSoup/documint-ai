
// import * as fs from "fs/promises"; // Removed
// import * as path from "path"; // Removed

export interface GraphNode {
    id: string; // File path relative to root
    imports: string[];
    exports: string[];
    type: "component" | "hook" | "lib" | "api" | "page" | "unknown";
    riskScore: number; // 0-100 based on complexity
    folder: string;
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

/**
 * Advanced file parser with heuristic-based complexity analysis
 */
function parseFile(filePath: string, content: string): GraphNode {
    const imports: string[] = [];
    const exports: string[] = [];

    // Strip comments for more accurate metric calculation
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");

    // Robust Regex for ESM imports (handles multiline and mixed styles)
    const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(cleanContent)) !== null) {
        imports.push(match[1]);
    }

    // Capture named and default exports
    const exportRegex = /export\s+(?:const|function|class|type|interface|enum|default)\s+(\w+)/g;
    while ((match = exportRegex.exec(cleanContent)) !== null) {
        exports.push(match[1]);
    }

    // Architecture-aware type classification
    let type: GraphNode['type'] = 'unknown';
    const lowerPath = filePath.toLowerCase();
    
    if (lowerPath.includes('component')) type = 'component';
    else if (lowerPath.includes('hook')) type = 'hook';
    else if (lowerPath.includes('lib') || lowerPath.includes('utils') || lowerPath.includes('service')) type = 'lib';
    else if (lowerPath.includes('api/') || lowerPath.endsWith('route.ts') || lowerPath.endsWith('route.js')) type = 'api';
    else if (lowerPath.includes('app/') && (lowerPath.endsWith('page.tsx') || lowerPath.endsWith('page.js'))) type = 'page';

    /**
     * Enterprise Complexity Algorithm (Risk Score 0-100)
     * Factors:
     * 1. Volumetric Weight (SLOC)
     * 2. Dependency Gravity (Imports)
     * 3. Logic Density (Control flow keywords)
     * 4. Encapsulation Quality (Export-to-Import ratio)
     */
    const lines = content.split('\n').length;
    const controlKeywords = (cleanContent.match(/\b(if|else|switch|case|for|while|try|catch|map|filter|reduce)\b/g) || []).length;
    
    const slocFactor = Math.min((lines / 800) * 25, 25);
    const dependencyFactor = Math.min((imports.length / 25) * 25, 25);
    const densityFactor = Math.min((controlKeywords / 30) * 30, 30);
    const encapsulationFactor = exports.length === 0 ? 20 : Math.max(0, 20 - (exports.length * 2));
    
    const riskScore = Math.min(Math.round(slocFactor + dependencyFactor + densityFactor + encapsulationFactor), 100);

    // Structural Context
    const folderParts = filePath.split('/');
    const folder = folderParts.length > 1 ? folderParts.slice(0, -1).join('/') : 'root';

    return {
        id: filePath,
        imports: Array.from(new Set(imports)), // Deduplicate
        exports: Array.from(new Set(exports)),
        type,
        riskScore,
        folder
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
