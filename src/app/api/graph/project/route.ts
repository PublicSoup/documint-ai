import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileContent } from "@/lib/files";
import { buildProjectGraph, GraphNode, ProjectGraph } from "@/lib/graph/project-graph";
import { projectGraphToMermaidResult } from "@/lib/graph/mermaid-adapter";
import {
    projectGraphToSequenceDiagram,
    projectGraphToClassDiagram,
    projectGraphToMindmap,
} from "@/lib/graph/mermaid-views";
import { checkTeamPermission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse, ApiErrors } from "@/lib/api-utils";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { isGraphableSourcePath, normalizeProjectPath } from "@/lib/project-files";

const querySchema = z.object({
    teamId: z.string().trim().min(1).max(100).optional(),
    project: z.string().trim().min(1).max(200).optional(),
    fresh: z.enum(["0", "1"]).optional(),
}).strict();

const MAX_FILES = 150;
const MAX_SCAN = 1000; // metadata-only scan cap for enumerating projects
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_CONTENT_PER_FILE = 64 * 1024; // 64 KB cap per file (the rest is irrelevant for the graph)

const ROOT_PROJECT = "(root)";

/**
 * A "project" is the top-level directory of a file's path — folder uploads and
 * GitHub imports wrap each project in its own directory, so the first path
 * segment is a reliable boundary. Files with no directory group under `(root)`.
 */
function projectOf(normalizedPath: string): string {
    const slash = normalizedPath.indexOf("/");
    return slash === -1 ? ROOT_PROJECT : normalizedPath.slice(0, slash);
}

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
    projects: Array<{ name: string; fileCount: number }>;
    activeProject: string | null;
    views: {
        sequence: string;
        class: string;
        mindmap: string;
    };
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

/** Best-effort project name from package.json (for the mindmap root label). */
function inferProjectName(files: Array<{ path: string; content: string }>): string {
    const pkg = files.find((file) => file.path.endsWith("package.json"));
    if (pkg) {
        try {
            const name = (JSON.parse(pkg.content) as { name?: unknown }).name;
            if (typeof name === "string" && name.trim()) return name.trim();
        } catch {
            // Malformed package.json — fall through to the default label.
        }
    }
    return "Project";
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
        const { teamId, project } = parsed.data;

        if (teamId) {
            const hasPermission = await checkTeamPermission(session.user.id, teamId, "view");
            if (!hasPermission) {
                return errorResponse(ApiErrors.forbidden("You do not have permission to view this team's graph."));
            }
        }

        const where: Prisma.FileWhereInput = teamId
            ? { teamId }
            : { userId: session.user.id, teamId: null };

        // 1. Scan file *metadata* for the whole workspace (cheap — no content) so
        //    we can enumerate the distinct projects (top-level folders) the user
        //    has, independent of which one is currently selected.
        const metaFiles = await db.file.findMany({
            where,
            select: { id: true, name: true, language: true },
            orderBy: { updatedAt: "desc" },
            take: MAX_SCAN,
        });

        // 2. Enumerate projects and collect graphable, de-duplicated candidates
        //    (newest wins on a path collision, since metadata is newest-first).
        const projectCounts = new Map<string, number>();
        const candidates: Array<{ id: string; name: string; path: string }> = [];
        const seenPaths = new Set<string>();
        let skippedFiles = 0;

        for (const file of metaFiles) {
            const normalizedPath = normalizeProjectPath(file.name);
            if (!normalizedPath || !isGraphableSourcePath(normalizedPath, file.language)) {
                skippedFiles++;
                continue;
            }
            if (seenPaths.has(normalizedPath)) {
                skippedFiles++;
                continue;
            }
            seenPaths.add(normalizedPath);

            const proj = projectOf(normalizedPath);
            projectCounts.set(proj, (projectCounts.get(proj) ?? 0) + 1);
            candidates.push({ id: file.id, name: normalizedPath, path: normalizedPath });
        }

        const projects = [...projectCounts.entries()]
            .map(([name, fileCount]) => ({ name, fileCount }))
            .sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));

        // Only honour a project filter that actually exists; otherwise show all.
        const activeProject = project && projectCounts.has(project) ? project : null;
        const inScope = activeProject
            ? candidates.filter((c) => projectOf(c.path) === activeProject)
            : candidates;

        // 3. Load content only for the in-scope files (bounded by MAX_FILES / bytes).
        const scoped = inScope.slice(0, MAX_FILES);
        const contentRows: Array<{ id: string; content: string | null; storagePath: string | null }> =
            scoped.length
                ? await db.file.findMany({
                    where: { id: { in: scoped.map((c) => c.id) } },
                    select: { id: true, content: true, storagePath: true },
                })
                : [];
        const contentById = new Map(contentRows.map((r) => [r.id, r]));

        const files: Array<{ path: string; content: string }> = [];
        const errors: GraphResponse["stats"]["errors"] = [];
        const pathToFileId = new Map<string, string>();
        let bytesScanned = 0;
        let truncated = inScope.length > scoped.length;

        for (const cand of scoped) {
            if (bytesScanned >= MAX_TOTAL_BYTES) {
                truncated = true;
                break;
            }
            const row = contentById.get(cand.id);
            try {
                const raw = row?.content ?? (row?.storagePath ? await getFileContent(cand.id) : null);
                if (!raw) {
                    errors.push({ fileId: cand.id, name: cand.name, reason: "empty" });
                    continue;
                }
                const content = safeTruncate(raw, MAX_CONTENT_PER_FILE);
                bytesScanned += content.length;
                pathToFileId.set(cand.path, cand.id);
                files.push({ path: cand.path, content });
            } catch (e: unknown) {
                const reason = e instanceof Error ? e.message : "fetch failed";
                errors.push({ fileId: cand.id, name: cand.name, reason });
            }
        }

        // 3. Build the graph and convert to Mermaid (dependency flowchart plus
        //    the alternate sequence / class / mindmap views, all from one crawl).
        const graph: ProjectGraph = await buildProjectGraph(files);
        const renderedGraph = projectGraphToMermaidResult(graph);
        const projectLabel = activeProject && activeProject !== ROOT_PROJECT ? activeProject : inferProjectName(files);
        const views = {
            sequence: projectGraphToSequenceDiagram(graph),
            class: projectGraphToClassDiagram(graph).mermaid,
            mindmap: projectGraphToMindmap(graph, projectLabel),
        };

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
            projects,
            activeProject,
            views,
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