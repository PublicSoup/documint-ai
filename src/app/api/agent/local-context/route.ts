import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
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
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        await enforceRateLimit(session.user.id, "api");

        const cwd = process.cwd();
        const fileList = await vfs.listFiles(session.user.id, ".", cwd);

        const dbFiles: Array<{ name: string; content: string | null }> = await db.file.findMany({
            where: { userId: session.user.id },
            select: { name: true, content: true },
        });
        const graph = await buildProjectGraph(dbFiles.map((f) => ({ path: f.name, content: f.content ?? "" })));
        const graphSummary = generateGraphSummary(graph);

        return NextResponse.json({ cwd, fileList, graphSummary }, {
            headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
        });
    } catch (error) {
        return errorResponse(error);
    }
}
