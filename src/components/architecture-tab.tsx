"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Filter,
    FileCode2,
    Info,
    Loader2,
    Network,
    RefreshCcw,
    Search,
    Sparkles,
    Upload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProBadge } from "@/components/ui/pro-badge";
import {
    getProjectGraphMermaid,
    createDemoProject,
    type GraphFetchResult,
    type GraphFileSummary,
    type GraphStats,
} from "@/app/dashboard/client-actions";

const DiagramViewer = dynamic(
    () => import("@/components/diagram-viewer").then((mod) => mod.DiagramViewer),
    {
        ssr: false,
        loading: () => (
            <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground bg-zinc-950/20">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                <p className="text-sm">Loading Visualization Engine...</p>
            </div>
        ),
    },
);

type FilterType = "all" | "component" | "page" | "api" | "lib" | "hook" | "unknown";

interface FilterState {
    type: FilterType;
    search: string;
    minRisk: number;
}

const DEFAULT_FILTER: FilterState = {
    type: "all",
    search: "",
    minRisk: 0,
};

const FILTER_OPTIONS: Array<{ value: FilterType; label: string; icon: string }> = [
    { value: "all", label: "All", icon: "🗂️" },
    { value: "component", label: "Components", icon: "🧩" },
    { value: "page", label: "Pages", icon: "📄" },
    { value: "api", label: "APIs", icon: "🔌" },
    { value: "lib", label: "Libs", icon: "📚" },
    { value: "hook", label: "Hooks", icon: "🪝" },
    { value: "unknown", label: "Other", icon: "📦" },
];

const SAMPLE_DIAGRAM = `flowchart TB
    subgraph Frontend["🎨 Frontend"]
        direction TB
        Dashboard["📊 Dashboard"]
        IDE["💻 Cloud IDE"]
        Auth["🔐 Auth Pages"]
    end

    subgraph Backend["⚙️ Backend API"]
        direction TB
        AuthAPI["Auth API"]
        FilesAPI["Files API"]
        AgentAPI["AI Agent API"]
        AuditAPI["Audit API"]
    end

    subgraph Services["🔧 Core Services"]
        direction TB
        AIProvider["Gemini AI"]
        Storage["Supabase Storage"]
        Database["PostgreSQL"]
    end

    Dashboard --> FilesAPI
    Dashboard --> AuditAPI
    IDE --> AgentAPI
    IDE --> FilesAPI
    Auth --> AuthAPI

    AuthAPI --> Database
    FilesAPI --> Storage
    FilesAPI --> Database
    AgentAPI --> AIProvider
    AuditAPI --> Database

    classDef frontend fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef backend fill:#10b981,stroke:#059669,color:#fff
    classDef services fill:#f59e0b,stroke:#d97706,color:#fff

    class Dashboard,IDE,Auth frontend
    class AuthAPI,FilesAPI,AgentAPI,AuditAPI backend
    class AIProvider,Storage,Database services`;

interface ArchitectureTabProps {
    teamId?: string;
}

export function ArchitectureTab({ teamId }: ArchitectureTabProps) {
    const router = useRouter();

    // Last *successful* response. We keep this on screen while a refresh
    // is in flight so the UI doesn't blink empty between requests.
    const [graph, setGraph] = useState<GraphFetchResult | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(true);
    const [loadingDemo, setLoadingDemo] = useState(false);
    const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
    const [showFilters, setShowFilters] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

    // Track the active AbortController so team switches cancel in-flight requests.
    const inflightRef = useRef<AbortController | null>(null);

    const fetchGraph = useCallback(
        async (mode: "initial" | "refresh" = "initial") => {
            // Cancel any previous request.
            inflightRef.current?.abort();
            const controller = new AbortController();
            inflightRef.current = controller;

            setIsRefreshing(true);
            setRenderError(null);
            try {
                const result = await getProjectGraphMermaid(teamId, {
                    fresh: mode === "refresh",
                    signal: controller.signal,
                });
                // The server response is the source of truth. If the request
                // was aborted by a newer call, ignore it.
                if (controller.signal.aborted) return;
                setGraph(result);
            } catch (e) {
                if (controller.signal.aborted) return;
                const message = e instanceof Error ? e.message : "Failed to load graph";
                setGraph({
                    isRealData: false,
                    code: "UNKNOWN",
                    message,
                    statusCode: 0,
                });
            } finally {
                if (!controller.signal.aborted) {
                    setIsRefreshing(false);
                }
            }
        },
        [teamId],
    );

    useEffect(() => {
        fetchGraph("initial");
        return () => inflightRef.current?.abort();
    }, [fetchGraph]);

    const handleLoadDemo = useCallback(async () => {
        setLoadingDemo(true);
        try {
            const result = await createDemoProject(teamId);
            if (result.success) {
                const created = result.createdFileIds.length;
                setToast({
                    kind: "success",
                    message: created > 0
                        ? `Seeded ${created} demo files — refreshing graph.`
                        : (result.message ?? "Demo files already present — refreshing graph."),
                });
                await fetchGraph("refresh");
            } else {
                setToast({
                    kind: "error",
                    message: result.message ?? "Failed to load demo project",
                });
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to load demo project";
            setToast({ kind: "error", message });
        } finally {
            setLoadingDemo(false);
        }
    }, [teamId, fetchGraph]);

    // Auto-dismiss the toast.
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(t);
    }, [toast]);

    const isRealData = graph?.isRealData === true;
    const stats: GraphStats | null = isRealData ? graph.stats : null;
    const files: GraphFileSummary[] = isRealData ? graph.files : [];

    // Apply the filter UI to the *server* response: we use the file
    // summaries to build a type-prefix Mermaid `flowchart` substring that
    // the viewer re-renders. The simplest robust approach: when the user
    // changes a filter, we re-fetch (since the server has the source of
    // truth) with a query param, OR we filter client-side by stripping
    // non-matching nodes from the rendered Mermaid via a query.
    //
    // For a low-latency UX, we filter *displayed* files in the file list
    // (below) and emit a note in the diagram header if the user is viewing
    // a subset. The full Mermaid still renders all nodes.
    const filteredFiles = useMemo(() => {
        if (!files) return [];
        const lowerSearch = filter.search.toLowerCase();
        return files.filter((f) => {
            if (filter.type !== "all" && f.type !== filter.type) return false;
            if (filter.minRisk > 0 && f.riskScore < filter.minRisk) return false;
            if (lowerSearch && !f.name.toLowerCase().includes(lowerSearch)) return false;
            return true;
        });
    }, [files, filter]);

    const mermaidCode = isRealData ? graph.mermaid : SAMPLE_DIAGRAM;

    const handleNodeClick = useCallback(
        (filePath: string) => {
            // The viewer hands us the file path (the Mermaid click handler
            // encoded it; we decode in the viewer). Translate that to a
            // file id by looking up the matching summary.
            const summary = files.find((f) => f.name === filePath);
            if (summary) {
                router.push(`/code?fileId=${encodeURIComponent(summary.id)}`);
            } else {
                // Fallback: open the IDE without a specific file.
                router.push(`/code?file=${encodeURIComponent(filePath)}`);
            }
        },
        [files, router],
    );

    if (isRefreshing && !graph) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                <p>Analyzing Project Structure...</p>
                <p className="text-xs opacity-50 mt-2">Parsing imports and dependencies</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                    <div>
                        <h3 className="text-lg font-medium text-white flex items-center gap-2">
                            <Network className="w-5 h-5 text-primary" />
                            Project Architecture
                            <ProBadge />
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Live visualization of your project's component and dependency graph.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    {isRealData && stats && (
                        <div className="flex items-center gap-2 text-[11px] font-mono">
                            <span className="bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-1 rounded">
                                {stats.totalNodes} nodes
                            </span>
                            <span className="bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-1 rounded">
                                {stats.totalEdges} edges
                            </span>
                            {stats.riskBuckets.high > 0 && (
                                <span className="bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-1 rounded">
                                    {stats.riskBuckets.high} high-risk
                                </span>
                            )}
                            {stats.truncated && (
                                <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-1 rounded">
                                    truncated
                                </span>
                            )}
                        </div>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => fetchGraph("refresh")}
                        disabled={isRefreshing}
                        aria-label="Refresh graph"
                    >
                        <RefreshCcw className={isRefreshing ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
                        Refresh
                    </Button>
                </div>
            </div>

            {toast && (
                <Alert
                    className={
                        toast.kind === "success"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                    }
                >
                    {toast.kind === "success" ? (
                        <CheckCircle2 className="w-4 h-4" />
                    ) : (
                        <AlertCircle className="w-4 h-4" />
                    )}
                    <AlertTitle>{toast.kind === "success" ? "Success" : "Error"}</AlertTitle>
                    <AlertDescription>{toast.message}</AlertDescription>
                </Alert>
            )}

            {/* Upgrade-required state */}
            {!isRealData && graph && !graph.isRealData && graph.code === "PRO_REQUIRED" && (
                <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-300">
                    <Sparkles className="w-4 h-4" />
                    <AlertTitle>Pro Feature</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                        <span>{graph.message}</span>
                        <div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                onClick={() => router.push(graph.upgradeUrl ?? "/dashboard/billing")}
                            >
                                Upgrade to Pro
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Empty workspace state */}
            {!isRealData && (!graph || graph.isRealData === false) &&
                (!graph || graph.code !== "PRO_REQUIRED") && (
                <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-300">
                    <Sparkles className="w-4 h-4" />
                    <AlertTitle>Sample Diagram</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                        <span>
                            {graph && !graph.isRealData
                                ? graph.message
                                : "This is a sample visualization. Upload source files or load a demo project to see your real architecture."}
                        </span>
                        <div className="flex gap-2 flex-wrap">
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                onClick={handleLoadDemo}
                                disabled={loadingDemo}
                            >
                                {loadingDemo ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Sparkles className="w-3 h-3" />
                                )}
                                Load Demo Project
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                onClick={() => router.push("/dashboard")}
                            >
                                <Upload className="w-3 h-3" />
                                Upload Files
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Live data banner */}
            {isRealData && (
                <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-300">
                    <Info className="w-4 h-4" />
                    <AlertTitle>Live Graph</AlertTitle>
                    <AlertDescription>
                        This diagram is auto-generated from your actual source code. Node border
                        color indicates risk (green=low, amber=med, red=high). Click a node to open
                        it in the Cloud IDE.
                    </AlertDescription>
                </Alert>
            )}

            {/* Filters */}
            {isRealData && files.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2"
                            onClick={() => setShowFilters((v) => !v)}
                        >
                            <Filter className="w-3.5 h-3.5" />
                            {showFilters ? "Hide filters" : "Show filters"}
                        </Button>
                        {filter.type !== "all" && (
                            <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-1 rounded">
                                {filter.type}
                            </span>
                        )}
                        {filter.search && (
                            <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-1 rounded">
                                "{filter.search}"
                            </span>
                        )}
                        {filter.minRisk > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-1 rounded">
                                risk ≥ {filter.minRisk}
                            </span>
                        )}
                    </div>
                    {showFilters && (
                        <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-3">
                            <div className="flex gap-2 flex-wrap">
                                {FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() =>
                                            setFilter((prev) => ({ ...prev, type: opt.value }))
                                        }
                                        className={
                                            "px-2.5 py-1 rounded text-xs border transition-colors " +
                                            (filter.type === opt.value
                                                ? "bg-primary/20 border-primary text-white"
                                                : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10")
                                        }
                                    >
                                        <span className="mr-1">{opt.icon}</span>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2 items-center">
                                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                    value={filter.search}
                                    onChange={(e) =>
                                        setFilter((prev) => ({ ...prev, search: e.target.value }))
                                    }
                                    placeholder="Search file names…"
                                    className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-primary"
                                />
                                <span className="text-[10px] text-muted-foreground ml-2">
                                    Min risk: {filter.minRisk}
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={filter.minRisk}
                                    onChange={(e) =>
                                        setFilter((prev) => ({
                                            ...prev,
                                            minRisk: Number(e.target.value),
                                        }))
                                    }
                                    className="w-32"
                                />
                                {(filter.type !== "all" || filter.search || filter.minRisk > 0) && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setFilter(DEFAULT_FILTER)}
                                    >
                                        Reset
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Diagram */}
            <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-2xl bg-zinc-950/50">
                <DiagramViewer
                    code={mermaidCode}
                    type="flowchart"
                    onError={setRenderError}
                    onNodeClick={handleNodeClick}
                />
            </div>

            {renderError && (
                <Alert className="bg-rose-500/10 border-rose-500/20 text-rose-300">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertTitle>Diagram Render Error</AlertTitle>
                    <AlertDescription>{renderError}</AlertDescription>
                </Alert>
            )}

            {/* Filtered file list — provides a textual alternative to the
                graph and lets the user verify the filter is doing what they
                expect. */}
            {isRealData && files.length > 0 && (
                <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold text-white">
                            Files in graph ({filteredFiles.length}/{files.length})
                        </span>
                        {stats?.errors && stats.errors.length > 0 && (
                            <span className="text-amber-300">
                                {stats.errors.length} file(s) failed to parse
                            </span>
                        )}
                    </div>
                    {filteredFiles.length > 0 ? (
                        <div className="max-h-[200px] overflow-y-auto space-y-1 custom-scrollbar">
                            {filteredFiles.slice(0, 50).map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => handleNodeClick(f.name)}
                                    className="w-full text-left flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors text-zinc-300"
                                >
                                    <FileCode2 className="w-3 h-3 text-muted-foreground shrink-0" />
                                    <span className="truncate flex-1">{f.name}</span>
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                        {f.type}
                                    </span>
                                    <span
                                        className={
                                            "text-[10px] font-mono " +
                                            (f.riskScore > 75
                                                ? "text-rose-400"
                                                : f.riskScore > 45
                                                ? "text-amber-400"
                                                : "text-emerald-400")
                                        }
                                    >
                                        {f.riskScore}
                                    </span>
                                </button>
                            ))}
                            {filteredFiles.length > 50 && (
                                <div className="text-[10px] text-muted-foreground px-2 py-1">
                                    …and {filteredFiles.length - 50} more
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground italic px-2 py-2">
                            No files match the current filters.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
