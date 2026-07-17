"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
    BarChart3, Eye, Clock, FileText, TrendingUp, TrendingDown,
    AlertCircle, AlertTriangle, CheckCircle, Loader2, Activity,
    BellRing, RefreshCw, Download, Info, ChevronDown, ShieldCheck,
    Target, Zap, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
    ResponsiveContainer
} from "recharts";
import { useToast } from "./toast";

interface AnalyticsData {
    overview: {
        totalFiles: number;
        totalViews: number;
        avgViewDuration: number;
        docsCreatedThisMonth: number;
        velocity: {
            score: number;
            trend: "up" | "down" | "stable";
        };
    };
    topDocs: {
        id: string;
        name: string;
        language: string | null;
        views: number;
        avgDuration: number;
    }[];
    staleDocs: {
        id: string;
        name: string;
        daysSinceUpdate: number;
        reason: "OUT_OF_SYNC" | "OLD_VERSION";
    }[];
    recentActivity: {
        date: string;
        views: number;
        creations: number;
    }[];
    heatmap: {
        date: string;
        count: number;
    }[];
    coverage: {
        documented: number;
        total: number;
        percentage: number;
    };
    teamInfo?: {
        name: string;
        memberCount: number;
        coverageGoal: number;
    };
}

type Severity = "critical" | "warning" | "positive" | "info";

interface Insight {
    id: string;
    severity: Severity;
    title: string;
    detail: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };

function pctChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function sumBy<T>(rows: T[], key: (r: T) => number): number {
    return rows.reduce((acc, r) => acc + key(r), 0);
}

export default function AnalyticsDashboard({ teamId }: { teamId?: string }) {
    const { toast } = useToast();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notifying, setNotifying] = useState(false);
    const [timeRange, setTimeRange] = useState(30);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const fetchAnalytics = async () => {
            setLoading(true);
            setError("");

            try {
                const params = new URLSearchParams({ days: timeRange.toString() });
                if (teamId) params.append("teamId", teamId);

                const res = await fetch(`/api/analytics/docs?${params.toString()}`, {
                    signal: controller.signal,
                });

                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(payload.error || "Failed to fetch analytics");
                }

                setData(payload as AnalyticsData);
                setLastUpdated(new Date());
            } catch (e: unknown) {
                if (!controller.signal.aborted) {
                    const message = e instanceof Error ? e.message : "Failed to fetch analytics";
                    setError(message);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        };

        fetchAnalytics();
        return () => controller.abort();
    }, [timeRange, teamId, refreshToken]);

    const handleRefresh = () => {
        setRefreshing(true);
        setRefreshToken((prev) => prev + 1);
    };

    const handleNotifyTeam = async () => {
        if (!teamId || !data) return;
        setNotifying(true);
        try {
            const outOfSyncCount = data.staleDocs.filter(d => d.reason === "OUT_OF_SYNC").length;
            const res = await fetch("/api/webhooks/notify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "TEAM_HEALTH_ALERT",
                    title: "Manual Health Alert",
                    message: `Maintenance requested: **${outOfSyncCount}** files are currently out of sync and **${data.staleDocs.length}** docs are stale overall.`,
                    teamId
                })
            });

            if (res.ok) {
                toast("Team notified via Slack/Discord", "success");
            } else {
                toast("Failed to send notification", "error");
            }
        } catch {
            toast("Error sending notification", "error");
        } finally {
            setNotifying(false);
        }
    };

    // --- Derived analytics (grounded, deterministic) ---
    const derived = useMemo(() => {
        if (!data) return null;

        const activity = data.recentActivity;
        const last7 = activity.slice(-7);
        const prior7 = activity.slice(-14, -7);

        const viewsLast7 = sumBy(last7, a => a.views);
        const viewsPrior7 = sumBy(prior7, a => a.views);
        const creationsLast7 = sumBy(last7, a => a.creations);
        const creationsPrior7 = sumBy(prior7, a => a.creations);

        const viewsDelta = pctChange(viewsLast7, viewsPrior7);
        const creationsDelta = pctChange(creationsLast7, creationsPrior7);

        const goal = data.teamInfo?.coverageGoal ?? 80;
        const coverageGap = Math.max(0, goal - data.coverage.percentage);
        const docsToGoal = Math.max(
            0,
            Math.ceil((data.coverage.total * goal) / 100) - data.coverage.documented
        );

        // Cross-reference: which high-traffic docs are also stale? (highest business risk)
        const staleIds = new Set(data.staleDocs.map(d => d.id));
        const staleTopDocs = data.topDocs.filter(d => staleIds.has(d.id));

        const insights: Insight[] = [];

        if (staleTopDocs.length > 0) {
            const worst = staleTopDocs[0];
            insights.push({
                id: "stale-traffic",
                severity: "critical",
                title: `${staleTopDocs.length} high-traffic doc${staleTopDocs.length > 1 ? "s are" : " is"} out of date`,
                detail: `“${worst.name}” has ${worst.views} views but its docs lag behind the code. Readers are seeing stale guidance on your most-visited pages.`,
            });
        }

        if (data.coverage.percentage < goal && data.coverage.total > 0) {
            insights.push({
                id: "coverage-goal",
                severity: coverageGap > 20 ? "warning" : "info",
                title: `Coverage is ${coverageGap}pts below your ${goal}% target`,
                detail: `${data.coverage.documented} of ${data.coverage.total} files documented (${data.coverage.percentage}%). Document ${docsToGoal} more file${docsToGoal === 1 ? "" : "s"} to hit the goal.`,
            });
        }

        if (viewsPrior7 > 0 && viewsDelta <= -15) {
            insights.push({
                id: "views-down",
                severity: "warning",
                title: `Documentation views down ${Math.abs(viewsDelta)}% week-over-week`,
                detail: `${viewsLast7} views in the last 7 days vs ${viewsPrior7} the week before. Engagement is cooling — worth checking what changed.`,
            });
        } else if (viewsDelta >= 25 && viewsLast7 > 0) {
            insights.push({
                id: "views-up",
                severity: "positive",
                title: `Documentation views up ${viewsDelta}% week-over-week`,
                detail: `${viewsLast7} views in the last 7 days vs ${viewsPrior7} the week before. Readers are leaning in — a good moment to expand your best docs.`,
            });
        }

        if (data.overview.velocity.trend === "down" && data.overview.velocity.score <= -20) {
            insights.push({
                id: "velocity-down",
                severity: "info",
                title: `Authoring velocity down ${Math.abs(data.overview.velocity.score)}%`,
                detail: `${creationsLast7} docs created this week vs ${creationsPrior7} last week. Documentation is falling behind development pace.`,
            });
        }

        if (insights.length === 0) {
            insights.push({
                id: "healthy",
                severity: "positive",
                title: "No anomalies detected this period",
                detail: `Coverage at ${data.coverage.percentage}%, ${data.overview.totalViews} views tracked, and no high-traffic docs are out of sync. Documentation is healthy.`,
            });
        }

        insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

        // Sparkline series (last 14 days)
        const viewsSpark = activity.slice(-14).map(a => a.views);
        const creationsSpark = activity.slice(-14).map(a => a.creations);

        // Chart-ready series
        const chartData = activity.map(a => ({
            label: new Date(a.date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            date: a.date,
            views: a.views,
            creations: a.creations,
        }));

        return {
            viewsDelta, creationsDelta, viewsLast7, viewsPrior7,
            goal, coverageGap, docsToGoal, staleTopDocs,
            insights: insights.slice(0, 3),
            viewsSpark, creationsSpark, chartData,
        };
    }, [data]);

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Crunching your documentation metrics…</p>
            </div>
        );
    }

    if (!data || !derived) {
        return (
            <div className="text-center text-muted-foreground py-12 space-y-4">
                <p>{error || "Failed to load analytics data"}</p>
                <button
                    onClick={handleRefresh}
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                </button>
            </div>
        );
    }

    const contextLabel = data.teamInfo?.name
        ? `${data.teamInfo.name} · ${data.teamInfo.memberCount} member${data.teamInfo.memberCount === 1 ? "" : "s"}`
        : "Your workspace";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-primary" />
                        Documentation Analytics
                    </h1>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {contextLabel}
                        </span>
                        {lastUpdated && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/70" />
                                Data as of {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · cached ≤5&nbsp;min
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ExportMenu />
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        aria-label="Refresh analytics"
                        className="h-10 px-3 border rounded-lg bg-white/5 border-white/10 text-xs font-bold uppercase tracking-wide inline-flex items-center gap-2 hover:bg-white/10 disabled:opacity-60 transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(Number(e.target.value))}
                        aria-label="Time range"
                        className="h-10 px-3 border rounded-lg bg-white/5 border-white/10 text-sm text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
                    {error}
                </div>
            )}

            {/* Grounded insights strip */}
            <section aria-label="Key insights">
                <div className="flex items-center gap-2 mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    What needs your attention
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {derived.insights.map(insight => (
                        <InsightCard key={insight.id} insight={insight} />
                    ))}
                </div>
            </section>

            {/* KPI hero row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <KpiCard
                    label="Doc Coverage"
                    value={`${data.coverage.percentage}%`}
                    icon={<Target className="w-5 h-5 text-emerald-400" />}
                    tone="bg-emerald-500/15"
                    tooltip="Share of tracked files that have documentation attached."
                    sub={`${data.coverage.documented}/${data.coverage.total} files · goal ${derived.goal}%`}
                />
                <KpiCard
                    label="Views"
                    value={data.overview.totalViews.toLocaleString()}
                    icon={<Eye className="w-5 h-5 text-sky-400" />}
                    tone="bg-sky-500/15"
                    tooltip="Documentation views recorded in the selected period."
                    delta={derived.viewsDelta}
                    deltaLabel="vs prior 7d"
                    spark={derived.viewsSpark}
                    sparkColor="#38bdf8"
                />
                <KpiCard
                    label="Avg Read Time"
                    value={`${data.overview.avgViewDuration}s`}
                    icon={<Clock className="w-5 h-5 text-violet-400" />}
                    tone="bg-violet-500/15"
                    tooltip="Average time a reader spends per documentation view."
                    sub="per view"
                />
                <KpiCard
                    label="Authoring Velocity"
                    value={`${data.overview.velocity.score > 0 ? "+" : ""}${data.overview.velocity.score}%`}
                    icon={
                        data.overview.velocity.trend === "up" ? <TrendingUp className="w-5 h-5 text-emerald-400" />
                            : data.overview.velocity.trend === "down" ? <TrendingDown className="w-5 h-5 text-rose-400" />
                                : <Minus className="w-5 h-5 text-zinc-400" />
                    }
                    tone={
                        data.overview.velocity.trend === "up" ? "bg-emerald-500/15"
                            : data.overview.velocity.trend === "down" ? "bg-rose-500/15"
                                : "bg-zinc-500/15"
                    }
                    tooltip="Change in the number of docs created this week versus last week."
                    spark={derived.creationsSpark}
                    sparkColor="#a78bfa"
                />
                <KpiCard
                    label="Total Files"
                    value={data.overview.totalFiles.toLocaleString()}
                    icon={<FileText className="w-5 h-5 text-amber-400" />}
                    tone="bg-amber-500/15"
                    tooltip="Total source files tracked in this workspace."
                    sub={`${data.overview.docsCreatedThisMonth} created this month`}
                />
            </div>

            {/* Activity chart + coverage donut */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-sky-400" />
                            Views &amp; New Docs
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-zinc-400">
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> Views</span>
                            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-400" /> New docs</span>
                        </div>
                    </div>
                    <ActivityChart data={derived.chartData} />
                </div>

                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm flex flex-col">
                    <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        Coverage vs Goal
                    </h3>
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <CoverageDonut percentage={data.coverage.percentage} goal={derived.goal} />
                        <div className="text-center">
                            <p className="text-sm text-zinc-300">
                                <span className="font-semibold text-zinc-100">{data.coverage.documented}</span>
                                {" "}of {data.coverage.total} files documented
                            </p>
                            {data.coverage.percentage >= derived.goal ? (
                                <p className="text-xs text-emerald-400 mt-1 flex items-center justify-center gap-1">
                                    <CheckCircle className="w-3.5 h-3.5" /> Goal of {derived.goal}% met
                                </p>
                            ) : (
                                <p className="text-xs text-amber-400 mt-1">
                                    {derived.docsToGoal} more doc{derived.docsToGoal === 1 ? "" : "s"} to reach {derived.goal}%
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Contribution calendar */}
            <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                    <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-400" />
                        Documentation Contributions
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                        <span>Less</span>
                        <div className="flex gap-1">
                            <div className="w-3 h-3 rounded-sm bg-white/5" />
                            <div className="w-3 h-3 rounded-sm bg-emerald-500/30" />
                            <div className="w-3 h-3 rounded-sm bg-emerald-500/60" />
                            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                        </div>
                        <span>More</span>
                    </div>
                </div>
                <ContributionCalendar heatmap={data.heatmap} />
                <p className="text-[10px] text-zinc-500 mt-4 text-center">
                    Each cell is a day; intensity reflects documentation versions committed to the audit trail.
                </p>
            </div>

            {/* Drill-down: top docs + doc debt */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        Most Viewed Docs
                    </h3>
                    {data.topDocs.length > 0 ? (
                        <div className="space-y-1">
                            {data.topDocs.map((doc, i) => (
                                <TopDocRow
                                    key={doc.id}
                                    rank={i + 1}
                                    doc={doc}
                                    maxViews={data.topDocs[0].views || 1}
                                    isStale={derived.staleTopDocs.some(d => d.id === doc.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm py-8 text-center border border-dashed border-white/10 rounded-lg">
                            No views recorded yet.
                        </p>
                    )}
                </div>

                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-400" />
                            Documentation Debt
                            {data.staleDocs.length > 0 && (
                                <span className="text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                                    {data.staleDocs.length}
                                </span>
                            )}
                        </h3>
                        {teamId && data.staleDocs.length > 0 && (
                            <button
                                onClick={handleNotifyTeam}
                                disabled={notifying}
                                className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-400 hover:text-amber-300 transition-colors border border-amber-500/20 px-2 py-1 rounded-lg bg-amber-500/5"
                            >
                                {notifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <BellRing className="w-3 h-3" />}
                                Notify Team
                            </button>
                        )}
                    </div>
                    {data.staleDocs.length > 0 ? (
                        <div className="space-y-2">
                            {data.staleDocs.map((doc) => (
                                <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors group">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${doc.reason === "OUT_OF_SYNC" ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" : "bg-amber-500"}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-zinc-100 truncate text-sm">{doc.name}</p>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${doc.reason === "OUT_OF_SYNC" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300"}`}>
                                            {doc.reason === "OUT_OF_SYNC" ? "Code changed after docs" : "Update recommended"}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-amber-400 font-semibold text-sm">{doc.daysSinceUpdate}d</p>
                                        <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">stale</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-emerald-400 text-sm flex items-center gap-2 py-8 justify-center">
                            <CheckCircle className="w-4 h-4" />
                            All docs are up to date!
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------------- Sub-components ---------------- */

function InsightCard({ insight }: { insight: Insight }) {
    const config: Record<Severity, { border: string; bg: string; text: string; icon: React.ReactNode }> = {
        critical: {
            border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-300",
            icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
        },
        warning: {
            border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-300",
            icon: <AlertCircle className="w-4 h-4 text-amber-400" />,
        },
        positive: {
            border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-300",
            icon: <CheckCircle className="w-4 h-4 text-emerald-400" />,
        },
        info: {
            border: "border-sky-500/30", bg: "bg-sky-500/10", text: "text-sky-300",
            icon: <Info className="w-4 h-4 text-sky-400" />,
        },
    };
    const c = config[insight.severity];
    return (
        <div className={`rounded-xl border ${c.border} ${c.bg} p-4 flex flex-col gap-1.5`}>
            <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{c.icon}</span>
                <p className={`text-sm font-semibold ${c.text}`}>{insight.title}</p>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed pl-6">{insight.detail}</p>
        </div>
    );
}

function KpiCard({
    label, value, icon, tone, tooltip, sub, delta, deltaLabel, spark, sparkColor,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
    tone: string;
    tooltip: string;
    sub?: string;
    delta?: number;
    deltaLabel?: string;
    spark?: number[];
    sparkColor?: string;
}) {
    const deltaTone = delta === undefined ? "" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-zinc-400";
    return (
        <div className="bg-white/5 border-white/10 p-5 rounded-xl border shadow-sm relative group">
            <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-lg ${tone} flex items-center justify-center`}>
                    {icon}
                </div>
                <span className="text-zinc-600 hover:text-zinc-300 cursor-help transition-colors" title={tooltip}>
                    <Info className="w-3.5 h-3.5" />
                </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-zinc-100 tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>

            {(delta !== undefined || sub) && (
                <div className="mt-2 flex items-center gap-2 min-h-[16px]">
                    {delta !== undefined && (
                        <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${deltaTone}`}>
                            {delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : delta < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {Math.abs(delta)}%
                        </span>
                    )}
                    {delta !== undefined && deltaLabel && (
                        <span className="text-[10px] text-zinc-500">{deltaLabel}</span>
                    )}
                    {sub && delta === undefined && (
                        <span className="text-[10px] text-zinc-500">{sub}</span>
                    )}
                </div>
            )}

            {spark && spark.length > 1 && (
                <div className="mt-2">
                    <Sparkline values={spark} color={sparkColor ?? "#8b5cf6"} />
                </div>
            )}
        </div>
    );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
    const w = 120, h = 28;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const step = w / (values.length - 1);
    const points = values.map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * (h - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const areaPath = `M0,${h} L${points.join(" L")} L${w},${h} Z`;
    const gid = `spark-${color.replace("#", "")}`;
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gid})`} />
            <polyline
                points={points.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

interface ChartTooltipProps {
    active?: boolean;
    payload?: { dataKey?: string | number; name?: string; value?: number; color?: string }[];
    label?: string | number;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    return (
        <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 shadow-xl backdrop-blur-sm">
            <p className="text-[11px] font-semibold text-zinc-300 mb-1">{label}</p>
            {payload.map((p) => (
                <p key={p.dataKey} className="text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                    <span className="text-zinc-400 capitalize">{p.name}:</span>
                    <span className="text-zinc-100 font-semibold">{p.value}</span>
                </p>
            ))}
        </div>
    );
}

function ActivityChart({ data }: { data: { label: string; views: number; creations: number }[] }) {
    return (
        <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="fillViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="fillCreations" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                        dataKey="label"
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                    />
                    <YAxis
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        allowDecimals={false}
                    />
                    <RTooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
                    <Area type="monotone" dataKey="views" name="Views" stroke="#38bdf8" strokeWidth={2} fill="url(#fillViews)" />
                    <Area type="monotone" dataKey="creations" name="New docs" stroke="#a78bfa" strokeWidth={2} fill="url(#fillCreations)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

function CoverageDonut({ percentage, goal }: { percentage: number; goal: number }) {
    const r = 46;
    const circ = 2 * Math.PI * r;
    const dash = (percentage / 100) * circ;
    const goalAngle = (goal / 100) * 360 - 90; // degrees, 0% at top
    const goalRad = (goalAngle * Math.PI) / 180;
    const gx = 60 + r * Math.cos(goalRad);
    const gy = 60 + r * Math.sin(goalRad);
    const met = percentage >= goal;
    const stroke = met ? "#10b981" : "hsl(265 85% 65%)";

    return (
        <div className="relative w-32 h-32">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
                <circle
                    cx="60" cy="60" r={r}
                    stroke={stroke} strokeWidth="10" fill="none"
                    strokeDasharray={`${dash} ${circ}`}
                    strokeLinecap="round"
                    className="transition-all duration-700"
                />
                {/* Goal marker */}
                <circle cx={gx} cy={gy} r="3.5" fill="#fbbf24" stroke="#18181b" strokeWidth="1.5" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-zinc-100">{percentage}%</span>
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> goal {goal}%
                </span>
            </div>
        </div>
    );
}

function ContributionCalendar({ heatmap }: { heatmap: { date: string; count: number }[] }) {
    if (heatmap.length === 0) {
        return <p className="text-xs text-zinc-500 text-center py-4">No contribution data yet.</p>;
    }
    const max = Math.max(...heatmap.map(d => d.count), 1);
    const intensity = (count: number) => {
        if (count === 0) return "bg-white/5";
        const ratio = count / max;
        if (ratio <= 0.33) return "bg-emerald-500/30";
        if (ratio <= 0.66) return "bg-emerald-500/60";
        return "bg-emerald-500";
    };

    // Group into GitHub-style week columns (rows = weekday, cols = week)
    const firstWeekday = new Date(heatmap[0].date + "T00:00:00Z").getUTCDay();
    const cells: ({ date: string; count: number } | null)[] = [
        ...Array(firstWeekday).fill(null),
        ...heatmap,
    ];
    const weeks: ({ date: string; count: number } | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
    }

    return (
        <div className="overflow-x-auto">
            <div className="flex gap-1 min-w-fit">
                {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1">
                        {Array.from({ length: 7 }).map((_, di) => {
                            const cell = week[di];
                            if (!cell) return <div key={di} className="w-3 h-3" />;
                            return (
                                <div
                                    key={di}
                                    className={`w-3 h-3 rounded-sm ${intensity(cell.count)} transition-colors hover:ring-1 hover:ring-white/30 cursor-help`}
                                    title={`${cell.date}: ${cell.count} contribution${cell.count === 1 ? "" : "s"}`}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

function TopDocRow({ rank, doc, maxViews, isStale }: {
    rank: number;
    doc: { id: string; name: string; language: string | null; views: number; avgDuration: number };
    maxViews: number;
    isStale: boolean;
}) {
    const [open, setOpen] = useState(false);
    const share = Math.round((doc.views / maxViews) * 100);
    return (
        <button
            onClick={() => setOpen(o => !o)}
            className="w-full text-left p-2.5 rounded-lg hover:bg-white/5 transition-colors group"
        >
            <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {rank}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-100 truncate text-sm flex items-center gap-1.5">
                        {doc.name}
                        {isStale && (
                            <span title="This high-traffic doc is out of date">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            </span>
                        )}
                    </p>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">{doc.language ?? "unknown"}</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="font-semibold text-zinc-100 text-sm">{doc.views}</p>
                    <p className="text-[10px] text-zinc-500">views</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
            {open && (
                <div className="mt-2.5 pl-9 pr-1 space-y-2 animate-fade-in">
                    <div>
                        <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                            <span>Share of top-doc traffic</span>
                            <span>{share}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {doc.avgDuration}s avg read</span>
                        {isStale && <span className="text-rose-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> docs out of date</span>}
                    </div>
                </div>
            )}
        </button>
    );
}

function ExportMenu() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    const exports: { type: string; label: string; desc: string }[] = [
        { type: "overview", label: "Overview", desc: "Headline metrics summary" },
        { type: "files", label: "Files", desc: "Per-file coverage & views" },
        { type: "usage", label: "Activity log", desc: "Recent audit events" },
    ];

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label="Export analytics"
                aria-expanded={open}
                className="h-10 px-3 border rounded-lg bg-white/5 border-white/10 text-xs font-bold uppercase tracking-wide inline-flex items-center gap-2 hover:bg-white/10 transition-colors"
            >
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-md shadow-2xl z-20 p-1.5 animate-fade-in">
                    {exports.map(exp => (
                        <a
                            key={exp.type}
                            href={`/api/analytics/export?type=${exp.type}`}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <Download className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-zinc-100">{exp.label} <span className="text-[10px] text-zinc-500 uppercase">CSV</span></p>
                                <p className="text-[11px] text-zinc-500">{exp.desc}</p>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
