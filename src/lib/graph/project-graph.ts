
import * as fs from "fs/promises";
import * as path from "path";

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

export async function buildProjectGraph(rootDir: string): Promise<ProjectGraph> {
    const graph: ProjectGraph = {
        nodes: new Map(),
        edges: []
    };

    async function scanDir(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue; // Skip hidden
            if (EXCLUDE_DIRS.includes(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(rootDir, fullPath);

            if (entry.isDirectory()) {
                await scanDir(fullPath);
            } else if (EXTENSIONS.includes(path.extname(entry.name))) {
                const content = await fs.readFile(fullPath, 'utf-8');
                const node = parseFile(relativePath, content);
                graph.nodes.set(relativePath, node);
            }
        }
    }

    try {
        await scanDir(rootDir);
        // Build edges after all nodes are processed
        for (const [id, node] of graph.nodes) {
            for (const imp of node.imports) {
                // formatting import paths is complex (aliases, etc), for now we do simple matching
                // This is a "fuzzy" edge creation for the MVP
                const target = Array.from(graph.nodes.keys()).find(k => k.endsWith(imp) || k.includes(imp));
                if (target) {
                    graph.edges.push({ from: id, to: target });
                }
            }
        }
    } catch (error) {
        console.error("Failed to build project graph:", error);
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
