/**
 * A small, realistic sample graph for the empty / sample state of the
 * Architecture tab (shown before a user uploads real source or seeds the demo).
 * It exercises every layer so the visualization reads as intended out of the box.
 */

import type { ProjectGraphData } from "@/lib/graph/graph-data";

export const SAMPLE_GRAPH_DATA: ProjectGraphData = {
    nodes: [
        { id: "src/app/dashboard/page.tsx", fileId: "s1", name: "page.tsx", folder: "src/app/dashboard", type: "page", riskScore: 38, exports: ["DashboardPage"], inDegree: 0, outDegree: 2, loc: 4 },
        { id: "src/app/code/page.tsx", fileId: "s2", name: "page.tsx", folder: "src/app/code", type: "page", riskScore: 52, exports: ["CodePage"], inDegree: 0, outDegree: 2, loc: 5 },
        { id: "src/components/architecture-tab.tsx", fileId: "s3", name: "architecture-tab.tsx", folder: "src/components", type: "component", riskScore: 71, exports: ["ArchitectureTab"], inDegree: 1, outDegree: 3, loc: 8 },
        { id: "src/components/file-explorer.tsx", fileId: "s4", name: "file-explorer.tsx", folder: "src/components", type: "component", riskScore: 44, exports: ["FileExplorer"], inDegree: 1, outDegree: 2, loc: 6 },
        { id: "src/components/architecture/use-project-graph.ts", fileId: "s5", name: "use-project-graph.ts", folder: "src/components/architecture", type: "hook", riskScore: 33, exports: ["useProjectGraph"], inDegree: 1, outDegree: 1, loc: 3 },
        { id: "src/app/api/graph/project/route.ts", fileId: "s6", name: "route.ts", folder: "src/app/api/graph/project", type: "api", riskScore: 82, exports: ["GET"], inDegree: 1, outDegree: 2, loc: 6 },
        { id: "src/app/api/files/route.ts", fileId: "s7", name: "route.ts", folder: "src/app/api/files", type: "api", riskScore: 48, exports: ["GET", "POST"], inDegree: 1, outDegree: 1, loc: 4 },
        { id: "src/lib/graph/project-graph.ts", fileId: "s8", name: "project-graph.ts", folder: "src/lib/graph", type: "lib", riskScore: 64, exports: ["buildProjectGraph", "classifyFileType"], inDegree: 2, outDegree: 1, loc: 7 },
        { id: "src/lib/db.ts", fileId: "s9", name: "db.ts", folder: "src/lib", type: "lib", riskScore: 22, exports: ["db"], inDegree: 2, outDegree: 0, loc: 2 },
        { id: "src/lib/files.ts", fileId: "s10", name: "files.ts", folder: "src/lib", type: "lib", riskScore: 29, exports: ["getFileContent"], inDegree: 1, outDegree: 0, loc: 2 },
    ],
    edges: [
        { from: "src/app/dashboard/page.tsx", to: "src/components/architecture-tab.tsx" },
        { from: "src/app/dashboard/page.tsx", to: "src/components/file-explorer.tsx" },
        { from: "src/app/code/page.tsx", to: "src/components/file-explorer.tsx" },
        { from: "src/app/code/page.tsx", to: "src/components/architecture-tab.tsx" },
        { from: "src/components/architecture-tab.tsx", to: "src/components/architecture/use-project-graph.ts" },
        { from: "src/components/architecture-tab.tsx", to: "src/app/api/graph/project/route.ts" },
        { from: "src/components/architecture-tab.tsx", to: "src/lib/graph/project-graph.ts" },
        { from: "src/components/file-explorer.tsx", to: "src/app/api/files/route.ts" },
        { from: "src/components/file-explorer.tsx", to: "src/lib/files.ts" },
        { from: "src/components/architecture/use-project-graph.ts", to: "src/app/api/graph/project/route.ts" },
        { from: "src/app/api/graph/project/route.ts", to: "src/lib/graph/project-graph.ts" },
        { from: "src/app/api/graph/project/route.ts", to: "src/lib/db.ts" },
        { from: "src/app/api/files/route.ts", to: "src/lib/db.ts" },
        { from: "src/lib/graph/project-graph.ts", to: "src/lib/files.ts" },
    ],
    entryPoints: ["src/app/dashboard/page.tsx", "src/app/code/page.tsx", "src/components/architecture-tab.tsx"],
    truncated: false,
    totalNodes: 10,
    totalEdges: 14,
};
