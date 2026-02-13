import { ProjectGraph } from "./project-graph";

export function projectGraphToMermaid(graph: ProjectGraph): string {
    let mermaid = "flowchart TD\n";

    // Enterprise Color Palette & Styling
    mermaid += "    classDef component fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b,rx:5,ry:5\n";
    mermaid += "    classDef page fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32,rx:5,ry:5\n";
    mermaid += "    classDef api fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#ef6c00,rx:5,ry:5\n";
    mermaid += "    classDef lib fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#7b1fa2,rx:5,ry:5\n";
    mermaid += "    classDef hook fill:#fff8e1,stroke:#fbc02d,stroke-width:2px,color:#fbc02d,rx:5,ry:5\n";
    mermaid += "    classDef default fill:#f5f5f5,stroke:#616161,stroke-width:1px,color:#616161,rx:5,ry:5\n";

    // Visual Feedback (Heatmap) with Glow Effects (via stroke-width)
    mermaid += "    classDef riskLow stroke:#10b981,stroke-width:2px\n";
    mermaid += "    classDef riskMed stroke:#f59e0b,stroke-width:4px\n";
    mermaid += "    classDef riskHigh stroke:#ef4444,stroke-width:6px\n\n";

    // Group nodes by folder
    const folderGroups = new Map<string, string[]>();
    for (const [id, node] of graph.nodes) {
        const folder = node.folder || "root";
        if (!folderGroups.has(folder)) folderGroups.set(folder, []);
        folderGroups.get(folder)!.push(id);
    }

    // Structural Clustering & Node Definition
    let groupIdx = 0;
    for (const [folder, nodeIds] of folderGroups) {
        // Only show folder name, or 'root' for top-level files
        const folderLabel = folder === 'root' ? '📦 Project Root' : `📁 ${folder}`;

        mermaid += `    subgraph cluster_${groupIdx++} ["${folderLabel}"]\n`;
        mermaid += `        direction TB\n`;

        for (const id of nodeIds) {
            const node = graph.nodes.get(id)!;
            const safeId = id.replace(/[^a-zA-Z0-9]/g, "_");
            const filename = id.split('/').pop() || id;

            // Rich Label with Metadata (plain text for mermaid compatibility)
            const riskIcon = node.riskScore > 70 ? "🔥" : node.riskScore > 40 ? "⚠️" : "✅";
            const typeIcon = node.type === 'component' ? '🧩' : node.type === 'api' ? '🔌' : node.type === 'page' ? '📄' : node.type === 'hook' ? '🪝' : node.type === 'lib' ? '📚' : '📦';
            const label = `${typeIcon} ${filename} ${riskIcon}`;

            // Determine Risk Class
            let riskClass = "riskLow";
            if (node.riskScore > 75) riskClass = "riskHigh";
            else if (node.riskScore > 45) riskClass = "riskMed";

            mermaid += `        ${safeId}["${label}"]:::${node.type}\n`;
            mermaid += `        class ${safeId} ${riskClass}\n`;

            // Navigation Hook
            mermaid += `        click ${safeId} call mermaidNodeClick("${id}")\n`;
        }
        mermaid += `    end\n\n`;
    }

    // Add edges
    for (const edge of graph.edges) {
        const fromSafe = edge.from.replace(/[^a-zA-Z0-9]/g, "_");
        const toSafe = edge.to.replace(/[^a-zA-Z0-9]/g, "_");

        if (fromSafe !== toSafe) {
            mermaid += `    ${fromSafe} --> ${toSafe}\n`;
        }
    }

    return mermaid;
}
