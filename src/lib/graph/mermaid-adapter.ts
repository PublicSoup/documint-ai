import { ProjectGraph } from "./project-graph";

export function projectGraphToMermaid(graph: ProjectGraph): string {
    let mermaid = "flowchart TD\n";

    // Define styles
    mermaid += "    classDef component fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b\n";
    mermaid += "    classDef page fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32\n";
    mermaid += "    classDef api fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#ef6c00\n";
    mermaid += "    classDef lib fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#7b1fa2\n";
    mermaid += "    classDef hook fill:#fff8e1,stroke:#fbc02d,stroke-width:2px,color:#fbc02d\n";
    mermaid += "    classDef default fill:#f5f5f5,stroke:#616161,stroke-width:1px,color:#616161\n\n";

    // Add nodes
    for (const [id, node] of graph.nodes) {
        // Sanitize ID for Mermaid (remove spaces, special chars)
        const safeId = id.replace(/[^a-zA-Z0-9]/g, "_");
        // Label is the filename (basename)
        const label = id.split('/').pop() || id;

        mermaid += `    ${safeId}["${label}"]:::${node.type}\n`;
    }

    mermaid += "\n";

    // Add edges
    for (const edge of graph.edges) {
        const fromSafe = edge.from.replace(/[^a-zA-Z0-9]/g, "_");
        const toSafe = edge.to.replace(/[^a-zA-Z0-9]/g, "_");

        // Prevent self-loops just in case
        if (fromSafe !== toSafe) {
            mermaid += `    ${fromSafe} --> ${toSafe}\n`;
        }
    }

    return mermaid;
}
