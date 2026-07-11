"use client";

/**
 * Client-side wrappers around the architecture graph API.
 *
 * The real graph-building work happens on the server in
 * `/api/graph/project` and `/api/graph/seed-demo`. These helpers just
 * issue `fetch` calls, normalize errors, and surface a stable shape that
 * `architecture-tab.tsx` can render without needing to know the URL.
 *
 * If the user upgrades to a different plan or seeds the demo project, the
 * caller is responsible for re-invoking `getProjectGraphMermaid` to refresh
 * the diagram.
 */

export interface GraphStats {
    totalFilesScanned: number;
    totalNodes: number;
    totalEdges: number;
    truncated: boolean;
    renderTruncated?: boolean;
    renderedNodes?: number;
    renderedEdges?: number;
    skippedFiles?: number;
    types: Record<"component" | "hook" | "lib" | "api" | "page" | "unknown", number>;
    riskBuckets: { high: number; med: number; low: number };
    bytesScanned: number;
    errors: Array<{ fileId: string; name: string; reason: string }>;
}

export interface GraphFileSummary {
    id: string;
    name: string;
    type: "component" | "hook" | "lib" | "api" | "page" | "unknown";
    riskScore: number;
    folder: string;
    imports: number;
}

/** The visualization modes the Architecture tab can switch between. */
export type GraphViewKey = "flowchart" | "sequence" | "class" | "mindmap";

/**
 * Alternate Mermaid renderings of the same project graph. The `flowchart` mode
 * uses `RealGraphResponse.mermaid`; the rest come from here so the server only
 * crawls the workspace once.
 */
export interface ProjectViews {
    sequence: string;
    class: string;
    mindmap: string;
}

export interface ProjectSummary {
    name: string;
    fileCount: number;
}

export interface RealGraphResponse {
    isRealData: true;
    mermaid: string;
    projects?: ProjectSummary[];
    activeProject?: string | null;
    views?: ProjectViews;
    nodeMap?: Record<string, string>;
    stats: GraphStats;
    files: GraphFileSummary[];
}

export interface GraphFetchError {
    isRealData: false;
    code: "PRO_REQUIRED" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "NETWORK" | "UNKNOWN";
    message: string;
    upgradeUrl?: string;
    statusCode: number;
}

export type GraphFetchResult = RealGraphResponse | GraphFetchError;

export interface SeedDemoResponse {
    createdFileIds: string[];
    skipped: string[];
    message?: string;
}

export class GraphApiError extends Error {
    code: GraphFetchError["code"];
    statusCode: number;
    upgradeUrl?: string;
    constructor(message: string, code: GraphFetchError["code"], statusCode: number, upgradeUrl?: string) {
        super(message);
        this.name = "GraphApiError";
        this.code = code;
        this.statusCode = statusCode;
        this.upgradeUrl = upgradeUrl;
    }
}

interface RawGraphResponse {
    isRealData?: boolean;
    mermaid?: string;
    projects?: ProjectSummary[];
    activeProject?: string | null;
    views?: ProjectViews;
    stats?: GraphStats;
    files?: GraphFileSummary[];
    error?: string;
    code?: string;
    message?: string;
    upgradeUrl?: string;
}

function mapStatusToCode(status: number): GraphFetchError["code"] {
    if (status === 401) return "UNAUTHORIZED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 429) return "RATE_LIMITED";
    return "UNKNOWN";
}

async function parseResponse<T>(response: Response): Promise<T> {
    let data: unknown = null;
    try {
        data = await response.json();
    } catch {
        // Non-JSON body; fall through with null.
    }
    return data as T;
}

export interface GetProjectGraphOptions {
    teamId?: string;
    /** Scope the graph to a single project (top-level folder). Omit for all files. */
    project?: string | null;
    fresh?: boolean;
    signal?: AbortSignal;
}

/**
 * Fetch the architecture graph for the current user's workspace. The shape
 * is discriminated by `isRealData` — `false` means we hit a recoverable
 * error and the caller should show a fallback (sample diagram, error toast,
 * upgrade CTA, etc.).
 */
export async function getProjectGraphMermaid(
    teamId?: string,
    options: GetProjectGraphOptions = {},
): Promise<GraphFetchResult> {
    try {
        const params = new URLSearchParams();
        if (teamId) params.set("teamId", teamId);
        if (options.project) params.set("project", options.project);
        if (options.fresh) params.set("fresh", "1");
        const qs = params.toString();
        const url = `/api/graph/project${qs ? `?${qs}` : ""}`;

        const res = await fetch(url, {
            method: "GET",
            credentials: "include",
            signal: options.signal,
        });

        if (!res.ok) {
            const data = await parseResponse<RawGraphResponse>(res);
            return {
                isRealData: false,
                code: data?.code === "PRO_REQUIRED" ? "PRO_REQUIRED" : mapStatusToCode(res.status),
                message: data?.message ?? data?.error ?? `Request failed (${res.status})`,
                upgradeUrl: data?.upgradeUrl,
                statusCode: res.status,
            };
        }

        const data = await parseResponse<RealGraphResponse>(res);
        if (!data?.mermaid) {
            return {
                isRealData: false,
                code: "UNKNOWN",
                message: "Empty response from server",
                statusCode: res.status,
            };
        }
        return data;
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
            return {
                isRealData: false,
                code: "UNKNOWN",
                message: "Request was cancelled",
                statusCode: 0,
            };
        }
        const message = e instanceof Error ? e.message : "Network error";
        return {
            isRealData: false,
            code: "NETWORK",
            message,
            statusCode: 0,
        };
    }
}

export interface SeedDemoOptions {
    teamId?: string;
    signal?: AbortSignal;
}

/**
 * Seed the user's workspace (or a team workspace) with a curated set of demo
 * files so the Architecture tab has something to visualize.
 *
 * Pro/Team only — free users get a 403 with an upgrade CTA.
 */
export async function createDemoProject(
    teamId?: string,
    options: SeedDemoOptions = {},
): Promise<{ success: boolean; createdFileIds: string[]; message?: string; code?: string; upgradeUrl?: string }> {
    try {
        const res = await fetch("/api/graph/seed-demo", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(teamId ? { teamId } : {}),
            signal: options.signal,
        });

        const data = await parseResponse<{
            createdFileIds?: string[];
            skipped?: string[];
            message?: string;
            error?: string;
            code?: string;
            upgradeUrl?: string;
        }>(res);

        if (!res.ok) {
            return {
                success: false,
                createdFileIds: [],
                message: data?.message ?? data?.error ?? `Request failed (${res.status})`,
                code: data?.code,
                upgradeUrl: data?.upgradeUrl,
            };
        }

        return {
            success: true,
            createdFileIds: data?.createdFileIds ?? [],
            message: data?.message,
        };
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
            return { success: false, createdFileIds: [], message: "Cancelled" };
        }
        const message = e instanceof Error ? e.message : "Network error";
        return { success: false, createdFileIds: [], message };
    }
}