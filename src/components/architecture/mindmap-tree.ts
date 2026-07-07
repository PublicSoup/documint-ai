/**
 * Build a real folder/file tree from the graph nodes for the interactive
 * mindmap. The old mindmap emitted indentation-sensitive Mermaid text capped at
 * 160 lines with "…more" stubs — no collapse, no interaction. This produces a
 * proper tree the React component can expand, collapse, and click through.
 */

import type { GraphDataNode } from "@/lib/graph/graph-data";
import type { NodeType } from "@/lib/graph/project-graph";

export interface TreeFile {
    kind: "file";
    id: string;
    name: string;
    fileId: string;
    type: NodeType;
    riskScore: number;
}

export interface TreeDir {
    kind: "dir";
    name: string;
    path: string;
    dirs: TreeDir[];
    files: TreeFile[];
    /** Total files in this subtree (for the folder count badge). */
    fileCount: number;
    /** Highest risk score anywhere in this subtree (drives the folder heat dot). */
    maxRisk: number;
}

export function buildTree(nodes: GraphDataNode[], rootLabel = "Project"): TreeDir {
    const root: TreeDir = {
        kind: "dir",
        name: rootLabel,
        path: "",
        dirs: [],
        files: [],
        fileCount: 0,
        maxRisk: 0,
    };

    for (const node of nodes) {
        const parts = node.id.split("/");
        parts.pop(); // filename
        let cursor = root;
        let accPath = "";
        for (const segment of parts) {
            accPath = accPath ? `${accPath}/${segment}` : segment;
            let child = cursor.dirs.find((d) => d.name === segment);
            if (!child) {
                child = {
                    kind: "dir",
                    name: segment,
                    path: accPath,
                    dirs: [],
                    files: [],
                    fileCount: 0,
                    maxRisk: 0,
                };
                cursor.dirs.push(child);
            }
            cursor = child;
        }
        cursor.files.push({
            kind: "file",
            id: node.id,
            name: node.name,
            fileId: node.fileId,
            type: node.type,
            riskScore: node.riskScore,
        });
    }

    // Sort + roll up counts/risk in a single post-order pass.
    const finalize = (dir: TreeDir): void => {
        dir.dirs.sort((a, b) => a.name.localeCompare(b.name));
        dir.files.sort((a, b) => a.name.localeCompare(b.name));
        let count = dir.files.length;
        let maxRisk = dir.files.reduce((m, f) => Math.max(m, f.riskScore), 0);
        for (const child of dir.dirs) {
            finalize(child);
            count += child.fileCount;
            maxRisk = Math.max(maxRisk, child.maxRisk);
        }
        dir.fileCount = count;
        dir.maxRisk = maxRisk;
    };
    finalize(root);

    return collapseSingleChildDirs(root);
}

/**
 * Collapse chains of single-child directories (e.g. `src` → `app` → `api`) into
 * one `src/app/api` node so the tree isn't a column of one-item folders.
 */
function collapseSingleChildDirs(dir: TreeDir): TreeDir {
    dir.dirs = dir.dirs.map(collapseSingleChildDirs);
    // Never collapse the synthetic root — it carries the project label.
    if (dir.path !== "") {
        while (dir.dirs.length === 1 && dir.files.length === 0) {
            const only = dir.dirs[0];
            dir = {
                ...only,
                name: `${dir.name}/${only.name}`,
            };
        }
    }
    return dir;
}
