"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertCircle,
    ArrowDownRight,
    ArrowUpRight,
    Award,
    BarChart3,
    Calendar,
    Loader2,
    Minus,
    RefreshCw,
    ShieldAlert,
    Target,
    TrendingUp,
    Trophy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WeeklyTrends {
    creations: { current: number; previous: number; change: number };
    approvals: { current: number; previous: number; change: number };
}

interface Contributor {
    userId: string;
    name: string;
    image: string | null;
    role: string;
    points: number;
    approvals: number;
    updates: number;
    creations: number;
}

interface ScorecardMetric {
    value: number;
    status: "healthy" | "warning" | "critical" | "active" | "stale";
}

interface ScorecardResponse {
    totalScore: number;
    grade: string;
    generatedAt: string;
    metrics: {
        coverage: ScorecardMetric & { target: number };
        drift: ScorecardMetric & { count: number };
        velocity: ScorecardMetric;
    };
}

interface DebtHotspot {
    name: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    reason: string;
}

interface DebtResponse {
    summary: string;
    hotspots: DebtHotspot[];
}

interface TeamAnalyticsProps {
    teamId: string;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(url, { signal });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        const explicitMessage = typeof body.message === "string" ? body.message : "";
        const fallbackError = typeof body.error === "string" ? body.error : "";

        const message =
            explicitMessage ||
            (fallbackError && fallbackError !== "ApiException" && fallbackError !== "Error"
                ? fallbackError
                : "Failed to load analytics");

        throw new Error(message);
    }

    return body as T;
}

export function TeamAnalytics({ teamId }: TeamAnalyticsProps) {
    const [trends, setTrends] = useState<WeeklyTrends | null>(null);
    const [leaderboard, setLeaderboard] = useState<Contributor[]>([]);
    const [scorecard, setScorecard] = useState<ScorecardResponse | null>(null);
    const [debt, setDebt] = useState<DebtResponse | null>(null);
    const [totalActivity, setTotalActivity] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const loadAnalytics = useCallback(async (signal: AbortSignal, background = false) => {
        if (background) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError("");

        try {
            const [summaryData, leaderboardData, scorecardData, debtData] = await Promise.all([
                fetchJson<{ trends: WeeklyTrends; totalActivity: number }>(`/api/teams/${teamId}/weekly-summary`, signal),
                fetchJson<{ leaderboard: Contributor[] }>(`/api/teams/${teamId}/leaderboard`, signal),
                fetchJson<ScorecardResponse>(`/api/teams/${teamId}/scorecard`, signal),
                fetchJson<DebtResponse>(`/api/teams/${teamId}/doc-debt`, signal),
            ]);

            setTrends(summaryData.trends);
            setTotalActivity(summaryData.totalActivity);
            setLeaderboard(Array.isArray(leaderboardData.leaderboard) ? leaderboardData.leaderboard : []);
            setScorecard(scorecardData);
            setDebt(debtData);
        } catch (requestError: unknown) {
            const message = requestError instanceof Error ? requestError.message : "Unable to load team analytics.";
            setError(message);
        } finally {
            if (background) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, [teamId]);

    useEffect(() => {
        const controller = new AbortController();
        void loadAnalytics(controller.signal);
        return () => controller.abort();
    }, [loadAnalytics]);

    const handleRefresh = async () => {
        const controller = new AbortController();
        await loadAnalytics(controller.signal, true);
    };

    if (loading) {
        return (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Aggregating Team Metrics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 border border-white/5 bg-white/[0.02] rounded-3xl flex flex-col items-center justify-center text-center gap-4">
                <AlertCircle className="w-8 h-8 text-amber-500/50" />
                <p className="text-sm font-medium text-zinc-300 max-w-md">{error}</p>
                <Button variant="outline" size="sm" className="h-8 gap-2" onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button variant="outline" size="sm" className="h-8 gap-2" onClick={handleRefresh} disabled={refreshing}>
                    {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh analytics
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="glass-card border-white/5 bg-black/20">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Weekly Output</span>
                            </div>
                            <TrendBadge change={trends?.creations.change ?? 0} />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-white">{trends?.creations.current ?? 0}</span>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">New Docs</span>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-1">vs {trends?.creations.previous ?? 0} last week</p>
                    </CardContent>
                </Card>

                <Card className="glass-card border-white/5 bg-black/20">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Award className="w-4 h-4 text-purple-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Quality Velocity</span>
                            </div>
                            <TrendBadge change={trends?.approvals.change ?? 0} />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-white">{trends?.approvals.current ?? 0}</span>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">Approvals</span>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-1">vs {trends?.approvals.previous ?? 0} last week</p>
                    </CardContent>
                </Card>
            </div>

            {scorecard && (
                <Card className="glass-card border-white/5 bg-black/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                            <Target className="w-4 h-4 text-blue-400" />
                            Team Scorecard · Grade {scorecard.grade}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="text-3xl font-black text-white">{scorecard.totalScore}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <MetricTile
                                label="Coverage"
                                value={`${scorecard.metrics.coverage.value}% / ${scorecard.metrics.coverage.target}%`}
                                status={scorecard.metrics.coverage.status}
                            />
                            <MetricTile
                                label="Drift"
                                value={`${scorecard.metrics.drift.value}% (${scorecard.metrics.drift.count} files)`}
                                status={scorecard.metrics.drift.status}
                            />
                            <MetricTile
                                label="Velocity"
                                value={`${scorecard.metrics.velocity.value} updates`}
                                status={scorecard.metrics.velocity.status}
                            />
                        </div>
                        <p className="text-[10px] text-zinc-500">Updated {new Date(scorecard.generatedAt).toLocaleString()}</p>
                    </CardContent>
                </Card>
            )}

            <Card className="glass-card border-white/5 bg-black/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        Documentation Debt Hotspots
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-xs text-zinc-300 leading-relaxed">
                        {debt?.summary || "No immediate debt hotspots identified."}
                    </p>

                    {(debt?.hotspots?.length ?? 0) === 0 ? (
                        <p className="text-[11px] text-zinc-500 italic">No critical hotspots in this cycle.</p>
                    ) : (
                        <div className="space-y-2">
                            {debt?.hotspots.map((hotspot) => (
                                <div key={`${hotspot.name}-${hotspot.priority}`} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-white truncate">{hotspot.name}</p>
                                        <PriorityBadge priority={hotspot.priority} />
                                    </div>
                                    <p className="text-[11px] text-zinc-400 mt-1">{hotspot.reason}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="glass-card border-white/5 bg-black/20">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        Contribution Leaderboard
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {leaderboard.length === 0 ? (
                            <p className="text-xs text-zinc-600 italic py-4 text-center">No contributions this period.</p>
                        ) : (
                            leaderboard.map((member, index) => (
                                <div
                                    key={member.userId}
                                    className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="relative shrink-0">
                                            <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center text-xs font-bold overflow-hidden">
                                                {member.image ? (
                                                    <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span>{member.name[0]}</span>
                                                )}
                                            </div>
                                            {index < 3 && (
                                                <div
                                                    className={cn(
                                                        "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black border border-black",
                                                        index === 0
                                                            ? "bg-amber-400 text-black"
                                                            : index === 1
                                                                ? "bg-zinc-400 text-black"
                                                                : "bg-orange-600 text-white",
                                                    )}
                                                >
                                                    {index + 1}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-white truncate">{member.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] text-zinc-500 uppercase font-black">{member.role}</span>
                                                <span className="text-[9px] text-primary/70 font-bold bg-primary/5 px-1.5 rounded-full border border-primary/10">
                                                    {member.points} pts
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 text-right shrink-0">
                                        <div className="hidden sm:block">
                                            <p className="text-[10px] font-black text-white">{member.creations}</p>
                                            <p className="text-[8px] text-zinc-600 uppercase font-bold">New</p>
                                        </div>
                                        <div className="hidden sm:block">
                                            <p className="text-[10px] font-black text-white">{member.approvals}</p>
                                            <p className="text-[8px] text-zinc-600 uppercase font-bold">Approved</p>
                                        </div>
                                        <div className="h-8 w-px bg-white/5 hidden sm:block" />
                                        <div className="w-10">
                                            <p className="text-[10px] font-black text-emerald-400">
                                                {Math.round((member.points / (totalActivity || 1)) * 100)}%
                                            </p>
                                            <p className="text-[8px] text-zinc-600 uppercase font-bold">Share</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-center gap-2 pt-2">
                <BarChart3 className="w-3 h-3 text-zinc-600" />
                <Calendar className="w-3 h-3 text-zinc-600" />
                <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Last 30 days of team momentum</p>
            </div>
        </div>
    );
}

function TrendBadge({ change }: { change: number }) {
    if (change > 0) {
        return (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-black">
                <ArrowUpRight className="w-2.5 h-2.5" />
                {change}%
            </div>
        );
    }

    if (change < 0) {
        return (
            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 text-[9px] font-black">
                <ArrowDownRight className="w-2.5 h-2.5" />
                {Math.abs(change)}%
            </div>
        );
    }

    return (
        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-zinc-500/10 text-zinc-500 border border-white/5 text-[9px] font-black">
            <Minus className="w-2.5 h-2.5" />
            0%
        </div>
    );
}

function MetricTile({
    label,
    value,
    status,
}: {
    label: string;
    value: string;
    status: "healthy" | "warning" | "critical" | "active" | "stale";
}) {
    const statusClass =
        status === "healthy" || status === "active"
            ? "text-emerald-300 border-emerald-500/20 bg-emerald-500/10"
            : status === "warning"
                ? "text-amber-300 border-amber-500/20 bg-amber-500/10"
                : status === "critical"
                    ? "text-rose-300 border-rose-500/20 bg-rose-500/10"
                    : "text-zinc-300 border-white/10 bg-white/[0.02]";

    return (
        <div className={cn("rounded-xl border p-3", statusClass)}>
            <p className="text-[10px] uppercase tracking-widest font-black">{label}</p>
            <p className="text-xs font-bold mt-1">{value}</p>
        </div>
    );
}

function PriorityBadge({ priority }: { priority: DebtHotspot["priority"] }) {
    const className =
        priority === "CRITICAL"
            ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
            : priority === "HIGH"
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-blue-500/15 text-blue-300 border-blue-500/30";

    return <span className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full border", className)}>{priority}</span>;
}
