"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    AlertTriangle,
    Boxes,
    CheckCircle2,
    Filter,
    FileCode2,
    Info,
    ListTree,
    Loader2,
    Network,
    RefreshCcw,
    Search,
    Sparkles,
    Upload,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProBadge } from "@/components/ui/pro-badge";
import {
    type GraphStats,
    type GraphViewKey,
} from "@/app/dashboard/client-actions";
import type { ProjectGraphData } from "@/lib/graph/graph-data";
import { SAMPLE_GRAPH_DATA } from "@/components/architecture/sample-graph-data";
import { SequenceView } from "@/components/architecture/sequence-view";
import { MindmapView } from "@/components/architecture/mindmap-view";
import { TYPE_STYLE } from "@/components/architecture/graph-theme";
import { useProjectGraph } from "@/components/architecture/use-project-graph";
import type { NodeType } from "@/lib/graph/project-graph";

// React Flow touches `window`/`ResizeObserver`, so load the canvas client-side only.
const GraphCanvas = dynamic(
    () => import("@/components/architecture/graph-canvas").then((mod) => mod.GraphCanvas),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Loading visualization engine…</p>
            </div>
        ),
    },
);

type FilterType = "all" | NodeType;

interface FilterState {
    type: FilterType;
    search: string;
    minRisk: number;
}

const DEFAULT_FILTER: FilterState = { type: "all", search: "", minRisk: 0 };

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
    { value: "all", label: "All" },
    { value: "page", label: "Pages" },
    { value: "component", label: "Components" },
    { value: "hook", label: "Hooks" },
    { value: "api", label: "APIs" },
    { value: "lib", label: "Libs" },
    { value: "unknown", label: "Other" },
];

const VIEW_OPTIONS: Array<{ value: GraphViewKey; label: string; icon: LucideIcon; hint: string }> = [
    { value: "flowchart", label: "Dependencies", icon: Network, hint: "Interactive import & dependency graph — hover to focus, click to open" },
    { value: "sequence", label: "Sequence", icon: Workflow, hint: "Trace a real request flow from any entry point through the layers" },
    { value: "class", label: "Classes", icon: Boxes, hint: "Each file as a class with its exported members" },
    { value: "mindmap", label: "Mindmap", icon: ListTree, hint: "Collapsible folder & file tree with risk heat" },
];

interface ArchitectureTabProps {
    teamId?: string;
}

export function ArchitectureTab({ teamId }: ArchitectureTabProps) {
    const router = useRouter();

    const {
        graph,
        isRefreshing,
        loadingDemo,
        renderError,
        toast,
        refreshGraph,
        loadDemoProject,
    } = useProjectGraph(teamId);

    const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState<GraphViewKey>("flowchart");

    const isRealData = graph?.isRealData === true;
    const stats: GraphStats | null = isRealData ? graph.stats : null;
    const projectName = isRealData ? graph.projectName ?? "Project" : "Sample Project";

    const data: ProjectGraphData = useMemo(
        () => (graph?.isRealData === true ? graph.graphData : SAMPLE_GRAPH_DATA),
        [graph],
    );

    // The filter drives which nodes the canvas renders. We apply it to the
    // structured graph directly so it works for both real and sample data.
    const filteredNodes = useMemo(() => {
        const lowerSearch = filter.search.toLowerCase();
        return data.nodes.filter((n) => {
            if (filter.type !== "all" && n.type !== filter.type) return false;
            if (filter.minRisk > 0 && n.riskScore < filter.minRisk) return false;
            if (lowerSearch && !n.id.toLowerCase().includes(lowerSearch)) return false;
            return true;
        });
    }, [data.nodes, filter]);

    const filterActive = filter.type !== "all" || Boolean(filter.search) || filter.minRisk > 0;
    const visibleIds = useMemo(
        () => (filterActive ? new Set(filteredNodes.map((n) => n.id)) : undefined),
        [filterActive, filteredNodes],
    );

    const activeViewHint = VIEW_OPTIONS.find((v) => v.value === viewMode)?.hint;

    const handleNodeClick = useCallback(
        (fileId: string) => {
            router.push(`/code?fileId=${encodeURIComponent(fileId)}`);
        },
        [router],
    );

    if (isRefreshing && !graph) {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <p>Analyzing project structure…</p>
                <p className="mt-2 text-xs opacity-50">Parsing imports and dependencies</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="flex items-center gap-2 text-lg font-medium text-white">
                        <Network className="h-5 w-5 text-primary" />
                        Project Architecture
                        <ProBadge />
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Interactive visualization of your project&apos;s component and dependency graph.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isRealData && stats && (
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-blue-300">
                                {stats.totalNodes} nodes
                            </span>
                            <span className="rounded border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-300">
                                {stats.totalEdges} edges
                            </span>
                            {stats.riskBuckets.high > 0 && (
                                <span className="rounded border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-300">
                                    {stats.riskBuckets.high} high-risk
                                </span>
                            )}
                        </div>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => refreshGraph("refresh")}
                        disabled={isRefreshing}
                        aria-label="Refresh graph"
                    >
                        <RefreshCcw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                        Refresh
                    </Button>
                </div>
            </div>

            {toast && (
                <Alert
                    className={
                        toast.kind === "success"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                            : "border-rose-500/20 bg-rose-500/10 text-rose-300"
                    }
                >
                    {toast.kind === "success" ? (
                        <CheckCircle2 className="h-4 w-4" />
                    ) : (
                        <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{toast.kind === "success" ? "Success" : "Error"}</AlertTitle>
                    <AlertDescription>{toast.message}</AlertDescription>
                </Alert>
            )}

            {/* Upgrade-required state */}
            {!isRealData && graph && !graph.isRealData && graph.code === "PRO_REQUIRED" && (
                <Alert className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                    <Sparkles className="h-4 w-4" />
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
                <Alert className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                    <Sparkles className="h-4 w-4" />
                    <AlertTitle>Sample Diagram</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                        <span>
                            {graph && !graph.isRealData
                                ? graph.message
                                : "This is a sample visualization. Upload source files or load a demo project to see your real architecture."}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                onClick={loadDemoProject}
                                disabled={loadingDemo}
                            >
                                {loadingDemo ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3 w-3" />
                                )}
                                Load Demo Project
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                onClick={() => router.push("/dashboard")}
                            >
                                <Upload className="h-3 w-3" />
                                Upload Files
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Live data banner */}
            {isRealData && (
                <Alert className="border-blue-500/20 bg-blue-500/10 text-blue-300">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Live Graph</AlertTitle>
                    <AlertDescription>
                        Auto-generated from your actual source code. Nodes are colored by layer and carry a
                        risk rail (green → amber → red). Hover to focus a node&apos;s neighbours, and click any
                        node to open it in the Cloud IDE.
                    </AlertDescription>
                </Alert>
            )}

            {isRealData && stats?.renderTruncated && (
                <Alert className="border-amber-500/20 bg-amber-500/10 text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Large Project View</AlertTitle>
                    <AlertDescription>
                        This project exceeds the interactive renderer limit, so the graph shows the most
                        connected and highest-risk files first.
                    </AlertDescription>
                </Alert>
            )}

            {/* Filters */}
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => setShowFilters((v) => !v)}
                    >
                        <Filter className="h-3.5 w-3.5" />
                        {showFilters ? "Hide filters" : "Show filters"}
                    </Button>
                    {filter.type !== "all" && <FilterChip>{filter.type}</FilterChip>}
                    {filter.search && <FilterChip>{`"${filter.search}"`}</FilterChip>}
                    {filter.minRisk > 0 && <FilterChip>{`risk ≥ ${filter.minRisk}`}</FilterChip>}
                    {filterActive && (
                        <span className="text-[11px] text-muted-foreground">
                            {filteredNodes.length}/{data.nodes.length} files
                        </span>
                    )}
                </div>
                {showFilters && (
                    <div className="space-y-3 rounded-lg border border-white/5 bg-black/20 p-3">
                        <div className="flex flex-wrap gap-2">
                            {FILTER_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => setFilter((prev) => ({ ...prev, type: opt.value }))}
                                    className={
                                        "rounded border px-2.5 py-1 text-xs transition-colors " +
                                        (filter.type === opt.value
                                            ? "border-primary bg-primary/20 text-white"
                                            : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10")
                                    }
                                >
                                    {opt.value !== "all" && (
                                        <span
                                            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                                            style={{ background: TYPE_STYLE[opt.value].accent }}
                                        />
                                    )}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Search className="h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                value={filter.search}
                                onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
                                placeholder="Search file paths…"
                                className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white placeholder:text-zinc-500 focus:border-primary focus:outline-none"
                            />
                            <span className="ml-2 text-[10px] text-muted-foreground">
                                Min risk: {filter.minRisk}
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={filter.minRisk}
                                onChange={(e) =>
                                    setFilter((prev) => ({ ...prev, minRisk: Number(e.target.value) }))
                                }
                                className="w-32"
                            />
                            {filterActive && (
                                <Button variant="ghost" size="sm" onClick={() => setFilter(DEFAULT_FILTER)}>
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* View-mode switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                    className="flex items-center gap-1 rounded-lg border border-white/5 bg-black/20 p-1"
                    role="tablist"
                    aria-label="Visualization mode"
                >
                    {VIEW_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const active = viewMode === opt.value;
                        return (
                            <button
                                key={opt.value}
                                role="tab"
                                aria-selected={active}
                                title={opt.hint}
                                onClick={() => setViewMode(opt.value)}
                                className={
                                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                                    (active
                                        ? "border border-primary/40 bg-primary/20 text-white"
                                        : "border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white")
                                }
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
                {activeViewHint && (
                    <span className="hidden text-[11px] text-muted-foreground sm:inline">{activeViewHint}</span>
                )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-400">
                {(Object.keys(TYPE_STYLE) as NodeType[]).map((type) => (
                    <span key={type} className="flex items-center gap-1.5">
                        <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ background: TYPE_STYLE[type].accent }}
                        />
                        {TYPE_STYLE[type].label}
                    </span>
                ))}
                <span className="ml-auto flex items-center gap-3 text-zinc-500">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-1 rounded bg-emerald-400" /> low</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-1 rounded bg-amber-400" /> med</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-1 rounded bg-rose-400" /> high risk</span>
                </span>
            </div>

            {/* Diagram surface */}
            <div className="h-[560px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50 shadow-2xl">
                {viewMode === "sequence" ? (
                    <SequenceView data={data} onNodeClick={handleNodeClick} />
                ) : viewMode === "mindmap" ? (
                    <MindmapView data={data} projectName={projectName} onNodeClick={handleNodeClick} />
                ) : (
                    <GraphCanvas
                        data={data}
                        variant={viewMode === "class" ? "class" : "dependency"}
                        visibleIds={visibleIds}
                        onNodeClick={handleNodeClick}
                    />
                )}
            </div>

            {renderError && (
                <Alert className="border-rose-500/20 bg-rose-500/10 text-rose-300">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Render Error</AlertTitle>
                    <AlertDescription>{renderError}</AlertDescription>
                </Alert>
            )}

            {/* Filtered file list — textual alternative + quick navigation. */}
            {isRealData && data.nodes.length > 0 && (
                <div className="space-y-2 rounded-lg border border-white/5 bg-black/20 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold text-white">
                            Files in graph ({filteredNodes.length}/{data.nodes.length})
                        </span>
                        {stats?.errors && stats.errors.length > 0 && (
                            <span className="text-amber-300">
                                {stats.errors.length} file(s) failed to parse
                            </span>
                        )}
                    </div>
                    {filteredNodes.length > 0 ? (
                        <div className="custom-scrollbar max-h-[200px] space-y-1 overflow-y-auto">
                            {filteredNodes.slice(0, 50).map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => handleNodeClick(n.fileId)}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-zinc-300 transition-colors hover:bg-white/5"
                                >
                                    <FileCode2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    <span className="flex-1 truncate">{n.id}</span>
                                    <span className="font-mono text-[10px] text-muted-foreground">{n.type}</span>
                                    <span
                                        className={
                                            "font-mono text-[10px] " +
                                            (n.riskScore > 75
                                                ? "text-rose-400"
                                                : n.riskScore > 45
                                                ? "text-amber-400"
                                                : "text-emerald-400")
                                        }
                                    >
                                        {n.riskScore}
                                    </span>
                                </button>
                            ))}
                            {filteredNodes.length > 50 && (
                                <div className="px-2 py-1 text-[10px] text-muted-foreground">
                                    …and {filteredNodes.length - 50} more
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="px-2 py-2 text-xs italic text-muted-foreground">
                            No files match the current filters.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function FilterChip({ children }: { children: React.ReactNode }) {
    return (
        <span className="rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {children}
        </span>
    );
}
