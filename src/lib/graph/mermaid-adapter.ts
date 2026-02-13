import { ProjectGraph } from "./project-graph";

/**
 * Sanitize a string for use inside mermaid double-quoted labels.
 * Strips characters that break mermaid syntax (quotes, brackets, semicolons).
 */
function sanitizeLabel(str: string): string {
    return str
        .replace(/"/g, '')       // Remove double quotes
        .replace(/'/g, '')       // Remove single quotes
        .replace(/[[\]{}();]/g, '') // Remove brackets, parens, semicolons
        .replace(/\s+/g, ' ')   // Collapse whitespace
        .trim();
}

/**
 * Sanitize a string for use inside mermaid click handler arguments.
 * Escapes double quotes so mermaid can parse the callback.
 */
function sanitizeClickArg(str: string): string {
    return str.replace(/"/g, '#quot;');
}

/**
 * Filter out files that aren't real source code and would pollute the graph.
 * Files like "use client"; or single-line directives should be skipped.
 */
function isValidSourceFile(filePath: string): boolean {
    // Skip if the file name looks like a JS expression rather than a file path
    if (filePath.startsWith('"') || filePath.startsWith("'")) return false;
    if (filePath.includes('use client') || filePath.includes('use server')) return false;
    // Must have an actual file extension
    if (!/\.\w+$/.test(filePath)) return false;
    return true;
}

export function projectGraphToMermaid(graph: ProjectGraph): string {
    let mermaid = "flowchart TD\n";

    // Dark-mode optimized color palette
    mermaid += "    classDef component fill:#1e3a5f,stroke:#3b82f6,stroke-width:2px,color:#93c5fd,rx:8,ry:8\n";
    mermaid += "    classDef page fill:#1a3a2a,stroke:#22c55e,stroke-width:2px,color:#86efac,rx:8,ry:8\n";
    mermaid += "    classDef api fill:#3b2a1a,stroke:#f97316,stroke-width:2px,color:#fdba74,rx:8,ry:8\n";
    mermaid += "    classDef lib fill:#2d1a3f,stroke:#a855f7,stroke-width:2px,color:#c4b5fd,rx:8,ry:8\n";
    mermaid += "    classDef hook fill:#3b3a1a,stroke:#eab308,stroke-width:2px,color:#fde047,rx:8,ry:8\n";
    mermaid += "    classDef unknown fill:#1e1e2e,stroke:#6b7280,stroke-width:1px,color:#9ca3af,rx:8,ry:8\n";

    // Risk heatmap classes
    mermaid += "    classDef riskLow stroke:#10b981,stroke-width:2px\n";
    mermaid += "    classDef riskMed stroke:#f59e0b,stroke-width:4px\n";
    mermaid += "    classDef riskHigh stroke:#ef4444,stroke-width:6px\n\n";

    // Group nodes by folder, filtering out invalid entries
    const folderGroups = new Map<string, string[]>();
    for (const [id, node] of graph.nodes) {
        if (!isValidSourceFile(id)) continue; // Skip non-source files
        const folder = node.folder || "root";
        if (!folderGroups.has(folder)) folderGroups.set(folder, []);
        folderGroups.get(folder)!.push(id);
    }

    // If no valid nodes, return a helpful empty state diagram
    if (folderGroups.size === 0) {
        return `flowchart TD
    empty["📭 No source files found"]:::unknown
    empty --- hint["Upload .ts, .tsx, .js files to see your architecture"]:::unknown`;
    }

    // Structural Clustering & Node Definition
    let groupIdx = 0;
    for (const [folder, nodeIds] of folderGroups) {
        const folderLabel = folder === 'root' ? '📦 Project Root' : `📁 ${sanitizeLabel(folder)}`;

        mermaid += `    subgraph cluster_${groupIdx++} ["${folderLabel}"]\n`;
        mermaid += `        direction TB\n`;

        for (const id of nodeIds) {
            const node = graph.nodes.get(id)!;
            const safeId = id.replace(/[^a-zA-Z0-9]/g, "_");
            const rawFilename = id.split('/').pop() || id;
            const filename = sanitizeLabel(rawFilename);

            // Type + risk icon label
            const riskIcon = node.riskScore > 70 ? "🔥" : node.riskScore > 40 ? "⚠️" : "✅";
            const typeIcon = node.type === 'component' ? '🧩' : node.type === 'api' ? '🔌' : node.type === 'page' ? '📄' : node.type === 'hook' ? '🪝' : node.type === 'lib' ? '📚' : '📦';
            const label = `${typeIcon} ${filename} ${riskIcon}`;

            // Determine Risk Class
            let riskClass = "riskLow";
            if (node.riskScore > 75) riskClass = "riskHigh";
            else if (node.riskScore > 45) riskClass = "riskMed";

            mermaid += `        ${safeId}["${sanitizeLabel(label)}"]:::${node.type}\n`;
            mermaid += `        class ${safeId} ${riskClass}\n`;

            // Navigation Hook — sanitize the ID for the click callback
            mermaid += `        click ${safeId} call mermaidNodeClick("${sanitizeClickArg(id)}")\n`;
        }
        mermaid += `    end\n\n`;
    }

    // Add edges (only between valid nodes)
    for (const edge of graph.edges) {
        if (!isValidSourceFile(edge.from) || !isValidSourceFile(edge.to)) continue;
        const fromSafe = edge.from.replace(/[^a-zA-Z0-9]/g, "_");
        const toSafe = edge.to.replace(/[^a-zA-Z0-9]/g, "_");

        if (fromSafe !== toSafe) {
            mermaid += `    ${fromSafe} --> ${toSafe}\n`;
        }
    }

    return mermaid;
}
