import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { buildProjectGraph, GraphNode, ProjectGraph } from "@/lib/graph/project-graph";
import { projectGraphToMermaidResult } from "@/lib/graph/mermaid-adapter";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { isGraphableSourcePath, normalizeProjectPath } from "@/lib/project-files";

const querySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
    fresh: z.enum(["0", "1"]).optional(),
}).strict();

const MAX_FILES = 150;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_CONTENT_PER_FILE = 64 * 1024; // 64 KB cap per file (the rest is irrelevant for the graph)

type RiskBucket = { high: number; med: number; low: number };

interface GraphFileSummary {
    id: string;
    name: string;
    type: GraphNode["type"];
    riskScore: number;
    folder: string;
    imports: number;
}

interface GraphResponse {
    isRealData: true;
    mermaid: string;
    nodeMap: Record<string, string>;
    stats: {
        totalFilesScanned: number;
        totalNodes: number;
        totalEdges: number;
        truncated: boolean;
        renderTruncated: boolean;
        renderedNodes: number;
        renderedEdges: number;
        skippedFiles: number;
        types: Record<GraphNode["type"], number>;
        riskBuckets: RiskBucket;
        bytesScanned: number;
        errors: Array<{ fileId: string; name: string; reason: string }>;
    };
    files: GraphFileSummary[];
}

function classifyRisk(score: number): "high" | "med" | "low" {
    if (score > 75) return "high";
    if (score > 45) return "med";
    return "low";
}

function safeTruncate(content: string, max: number): string {
    if (content.length <= max) return content;
    return content.slice(0, max);
}

/**
 * GET /api/graph/project
 *
 * Builds a project-level architecture graph for the current user's workspace
 * (personal files, or a team workspace if `teamId` is provided).
 *
 * Returns a Mermaid `flowchart` string plus summary statistics that the
 * dashboard's Architecture tab can render directly.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return errorResponse(ApiErrors.unauthorized());
        }

        await enforceRateLimit(session.user.id, "api");

        const { searchParams } = new URL(request.url);
        const parsed = querySchema.safeParse({
            teamId: searchParams.get("teamId") ?? undefined,
            fresh: searchParams.get("fresh") ?? undefined,
        });
        if (!parsed.success) {
            return errorResponse(ApiErrors.badRequest("Invalid query parameters"));
        }
        const { teamId } = parsed.data;

        if (teamId) {
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
            if (!hasPermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to view this team's graph."));
            }
        }

        // 1. Fetch the files in scope. We only need metadata + content for parsing.
        const where: Prisma.FileWhereInput = teamId
            ? { teamId }
            : { userId: session.user.id, teamId: null };

        const dbFiles = await db.file.findMany({
            where,
            select: {
                id: true,
                name: true,
                language: true,
                content: true,
                storagePath: true,
                size: true,
            },
            orderBy: { updatedAt: "desc" },
            take: MAX_FILES,
        });

        // 2. Load content for each file (DB inline, or storage fallback).
        const files: Array<{ path: string; content: string }> = [];
        const errors: GraphResponse["stats"]["errors"] = [];
        const pathToFileId = new Map<string, string>();
        let bytesScanned = 0;
        let truncated = false;
        let skippedFiles = 0;

        for (const file of dbFiles) {
            if (files.length >= MAX_FILES || bytesScanned >= MAX_TOTAL_BYTES) {
                truncated = true;
                break;
            }

            const normalizedPath = normalizeProjectPath(file.name);
            if (!normalizedPath || !isGraphableSourcePath(normalizedPath, file.language)) {
                skippedFiles++;
                continue;
            }

            // Files are ordered newest-first. If a user uploaded the same path
            // multiple times, keep the latest record so node click-through opens
            // the currently relevant file instead of an older duplicate.
            if (pathToFileId.has(normalizedPath)) {
                skippedFiles++;
                continue;
            }

            try {
                const raw = file.content ?? (file.storagePath ? await getFileContent(file.id) : null);
                if (!raw) {
                    errors.push({ fileId: file.id, name: file.name, reason: "empty" });
                    continue;
                }
                const content = safeTruncate(raw, MAX_CONTENT_PER_FILE);
                bytesScanned += content.length;
                pathToFileId.set(normalizedPath, file.id);
                files.push({ path: normalizedPath, content });
            } catch (e: unknown) {
                const reason = e instanceof Error ? e.message : "fetch failed";
                errors.push({ fileId: file.id, name: file.name, reason });
            }
        }

        // 3. Build the graph and convert to Mermaid.
        const graph: ProjectGraph = await buildProjectGraph(files);
        const renderedGraph = projectGraphToMermaidResult(graph);

        // 4. Aggregate stats.
        const types: Record<GraphNode["type"], number> = {
            component: 0, hook: 0, lib: 0, api: 0, page: 0, unknown: 0,
        };
        const riskBuckets: RiskBucket = { high: 0, med: 0, low: 0 };
        const summary: GraphFileSummary[] = [];

        for (const node of graph.nodes.values()) {
            types[node.type]++;
            const bucket = classifyRisk(node.riskScore);
            riskBuckets[bucket]++;
            summary.push({
                id: pathToFileId.get(node.id) ?? node.id,
                name: node.id,
                type: node.type,
                riskScore: node.riskScore,
                folder: node.folder,
                imports: node.imports.length,
            });
        }

        const response: GraphResponse = {
            isRealData: true,
            mermaid: renderedGraph.mermaid,
            nodeMap: renderedGraph.nodeMap,
            stats: {
                totalFilesScanned: files.length,
                totalNodes: graph.nodes.size,
                totalEdges: graph.edges.length,
                truncated: truncated || renderedGraph.truncated,
                renderTruncated: renderedGraph.truncated,
                renderedNodes: renderedGraph.renderedNodes,
                renderedEdges: renderedGraph.renderedEdges,
                skippedFiles,
                types,
                riskBuckets,
                bytesScanned,
                errors,
            },
            files: summary,
        };

        return NextResponse.json(response, {
            headers: {
                "Cache-Control": "private, max-age=0, must-revalidate",
            },
        });
    } catch (error) {
        return errorResponse(error);
    }
}