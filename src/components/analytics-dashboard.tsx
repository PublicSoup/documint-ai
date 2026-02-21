"use client";

import { useState, useEffect } from "react";
import {
    BarChart3, Eye, Clock, FileText, TrendingUp,
    AlertCircle, CheckCircle, Loader2, Calendar, Activity,
    BellRing, RefreshCw
} from "lucide-react";
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
        language: string;
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
        } catch (e) {
            toast("Error sending notification", "error");
        } finally {
            setNotifying(false);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center text-gray-500 py-12 space-y-4">
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

    const maxViews = Math.max(...data.recentActivity.map(a => a.views), 1);
    const maxCreations = Math.max(...data.recentActivity.map(a => a.creations), 1);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-purple-400" />
                        Documentation Analytics
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Insights into your documentation usage and health
                    </p>
                    {lastUpdated && (
                        <p className="text-[11px] text-zinc-500 mt-1">Updated {lastUpdated.toLocaleTimeString()}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="h-10 px-3 border rounded-lg bg-white/5 border-white/10 text-xs font-bold uppercase tracking-wide inline-flex items-center gap-2"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(Number(e.target.value))}
                        className="px-4 py-2 border rounded-lg bg-white/5 border-white/10 text-sm"
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

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-zinc-100">{data.overview.totalFiles}</p>
                            <p className="text-sm text-gray-500">Total Files</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <Eye className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-zinc-100">{data.overview.totalViews}</p>
                            <p className="text-sm text-gray-500">Total Views</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-zinc-100">{data.overview.avgViewDuration}s</p>
                            <p className="text-sm text-gray-500">Avg. Duration</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-zinc-100">{data.overview.docsCreatedThisMonth}</p>
                            <p className="text-sm text-gray-500">Created This Month</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            data.overview.velocity.trend === 'up' ? 'bg-emerald-500/20' : 
                            data.overview.velocity.trend === 'down' ? 'bg-rose-500/20' : 
                            'bg-zinc-500/20'
                        }`}>
                            <TrendingUp className={`w-5 h-5 ${
                                data.overview.velocity.trend === 'up' ? 'text-emerald-400' : 
                                data.overview.velocity.trend === 'down' ? 'text-rose-400' : 
                                'text-zinc-400'
                            }`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-zinc-100">{data.overview.velocity.score > 0 ? '+' : ''}{data.overview.velocity.score}%</p>
                            <p className="text-sm text-gray-500">Doc. Velocity</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Coverage & Activity Row */}
            <div className="grid grid-cols-2 gap-6">
                {/* Coverage */}
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        Documentation Coverage
                    </h3>
                    <div className="flex items-center gap-6">
                        <div className="relative w-24 h-24">
                            <svg className="w-24 h-24 transform -rotate-90">
                                <circle
                                    cx="48" cy="48" r="40"
                                    stroke="#e5e7eb" strokeWidth="8" fill="none"
                                />
                                <circle
                                    cx="48" cy="48" r="40"
                                    stroke="#8b5cf6" strokeWidth="8" fill="none"
                                    strokeDasharray={`${data.coverage.percentage * 2.51} 251`}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-zinc-100">
                                {data.coverage.percentage}%
                            </span>
                        </div>
                        <div>
                            <p className="text-zinc-400">
                                <span className="font-semibold text-zinc-100">{data.coverage.documented}</span> of {data.coverage.total} files documented
                            </p>
                            {data.coverage.percentage < 80 && (
                                <p className="text-sm text-amber-600 mt-2">
                                    ⚠️ Consider documenting more files
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Activity Chart */}
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        Recent Activity
                    </h3>
                    <div className="flex items-end gap-1 h-24">
                        {data.recentActivity.map((day, i) => (
                            <div key={day.date} className="flex-1 flex flex-col gap-1">
                                <div
                                    className="bg-blue-500 rounded-t transition-all"
                                    style={{ height: `${(day.views / maxViews) * 60}px` }}
                                    title={`${day.views} views`}
                                />
                                <div
                                    className="bg-green-500 rounded-b transition-all"
                                    style={{ height: `${(day.creations / maxCreations) * 20}px` }}
                                    title={`${day.creations} created`}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                        <span>{data.recentActivity[0]?.date.slice(5)}</span>
                        <div className="flex gap-4">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 bg-blue-500 rounded" /> Views
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded" /> Created
                            </span>
                        </div>
                        <span>{data.recentActivity[data.recentActivity.length - 1]?.date.slice(5)}</span>
                    </div>
                </div>
            </div>

            {/* Contribution Heatmap */}
            <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-500" />
                        Documentation Contributions
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase font-bold tracking-widest">
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
                
                <div className="flex flex-wrap gap-1 justify-between">
                    {data.heatmap.map((day) => {
                        const intensity = day.count === 0 ? "bg-white/5" :
                                         day.count < 3 ? "bg-emerald-500/30" :
                                         day.count < 6 ? "bg-emerald-500/60" : "bg-emerald-500";
                        
                        return (
                            <div 
                                key={day.date}
                                className={`w-3 h-3 rounded-sm ${intensity} transition-colors hover:ring-1 hover:ring-white/20 cursor-help`}
                                title={`${day.date}: ${day.count} contributions`}
                            />
                        );
                    })}
                </div>
                <p className="text-[10px] text-gray-500 mt-4 text-center italic uppercase tracking-tighter">
                    Each block represents a documentation version or update recorded in the high-integrity audit trail.
                </p>
            </div>

            {/* Top & Stale Docs */}
            <div className="grid grid-cols-2 gap-6">
                {/* Top Documents */}
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-500" />
                        Most Viewed Docs
                    </h3>
                    {data.topDocs.length > 0 ? (
                        <div className="space-y-3">
                            {data.topDocs.map((doc, i) => (
                                <div key={doc.id} className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-zinc-100 truncate">{doc.name}</p>
                                        <p className="text-xs text-gray-500">{doc.language}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-zinc-100">{doc.views}</p>
                                        <p className="text-xs text-gray-500">views</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-sm">No views recorded yet</p>
                    )}
                </div>

                {/* Stale Documents */}
                <div className="bg-white/5 border-white/10 p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-500" />
                            Stale Documentation
                        </h3>
                        {teamId && data.staleDocs.length > 0 && (
                            <button
                                onClick={handleNotifyTeam}
                                disabled={notifying}
                                className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-500 hover:text-amber-400 transition-colors border border-amber-500/20 px-2 py-1 rounded-lg bg-amber-500/5"
                            >
                                {notifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <BellRing className="w-3 h-3" />}
                                Notify Team
                            </button>
                        )}
                    </div>
                    {data.staleDocs.length > 0 ? (
                        <div className="space-y-3">
                            {data.staleDocs.map((doc) => (
                                <div key={doc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-zinc-100 truncate">{doc.name}</p>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${doc.reason === 'OUT_OF_SYNC' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                                            }`}>
                                            {doc.reason.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-amber-600 font-semibold">{doc.daysSinceUpdate}d</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-tighter">age</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-green-400 text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            All docs are up to date!
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
