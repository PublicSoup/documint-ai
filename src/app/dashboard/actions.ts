"use server";

import { buildProjectGraph } from "@/lib/graph/project-graph";
import { projectGraphToMermaid } from "@/lib/graph/mermaid-adapter";
import path from "path";

export async function getProjectGraphMermaid() {
    try {
        const rootDir = process.cwd();
        const graph = await buildProjectGraph(rootDir);
        return projectGraphToMermaid(graph);
    } catch (error) {
        console.error("Failed to generate project graph:", error);
        return "flowchart TD\n    Error[Error generating graph]:::error";
    }
}
