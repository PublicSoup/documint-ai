import { db } from "@/lib/db";
import { createApiHandler } from "@/lib/api-utils";
import * as vfs from "@/lib/agent/vm-fs";
import { buildProjectGraph, generateGraphSummary } from "@/lib/graph/project-graph";

/**
 * GET /api/agent/local-context
 *
 * Returns exactly the workspace snapshot (cwd, file list, dependency-graph
 * summary) that the server-side agent (engine.ts) builds at the start of
 * every run, so the browser-driven local-model agent (lib/local-agent.ts)
 * can build an identical system prompt via buildAgentSystemPrompt.
 */
export const GET = createApiHandler({
    rateLimit: "api",
    cacheControl: "private, max-age=0, must-revalidate",
    handler: async ({ userId }) => {
        const cwd = process.cwd();
        const fileList = await vfs.listFiles(userId, ".", cwd);

        const dbFiles: Array<{ name: string; content: string | null }> = await db.file.findMany({
            where: { userId },
            select: { name: true, content: true },
        });
        const graph = await buildProjectGraph(dbFiles.map((f) => ({ path: f.name, content: f.content ?? "" })));
        const graphSummary = generateGraphSummary(graph);

        return { cwd, fileList, graphSummary };
    },
});
