"use client";

import { useState, useEffect } from "react";
import { Activity, TrendingUp, FileText, Clock, Zap } from "lucide-react";

interface StatsData {
    filesAnalyzed: number;
    avgQualityScore: number;
    aiGenerations: number;
    weeklyTrend: number;
}

interface RecentActivity {
    id: string;
    action: string;
    file: string;
    time: string;
}

interface AnalyticsApiResponse {
    overview: {
        totalFiles: number;
        velocity: { score: number };
    };
    coverage: {
        percentage: number;
    };
    topDocs: { id: string; name: string; views: number }[];
    recentActivity: { date: string; views: number; creations: number }[];
}

function timeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function ActivityFeed() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [activity, setActivity] = useState<RecentActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setError(null);
                const res = await fetch("/api/analytics/docs?days=14", { cache: "no-store" });
                if (!res.ok) {
                    throw new Error(`Analytics request failed (${res.status})`);
                }

                const data = (await res.json()) as AnalyticsApiResponse;

                const recentViews = data.recentActivity.reduce((sum, d) => sum + d.views, 0);

                setStats({
                    filesAnalyzed: data.overview.totalFiles,
                    avgQualityScore: data.coverage.percentage,
                    aiGenerations: recentViews,
                    weeklyTrend: data.overview.velocity.score,
                });

                const nextActivity: RecentActivity[] = data.topDocs.slice(0, 4).map((doc, idx) => ({
                    id: doc.id,
                    action: `Viewed ${doc.views} time${doc.views === 1 ? "" : "s"}`,
                    file: doc.name,
                    time: timeAgo(data.recentActivity[Math.min(idx, data.recentActivity.length - 1)]?.date || new Date().toISOString()),
                }));

                setActivity(nextActivity);
            } catch (err) {
                console.error(err);
                setError("Failed to load activity");
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, []);

    if (loading) {
        return (
            <div className="bg-white/5 border-white/10 rounded-xl border p-6 animate-pulse">
                <div className="h-4 bg-white/10 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                    <div className="h-3 bg-white/10 rounded w-full"></div>
                    <div className="h-3 bg-white/10 rounded w-5/6"></div>
                    <div className="h-3 bg-white/10 rounded w-4/6"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white/5 border-white/10 rounded-xl border p-6 text-sm text-red-300">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={<FileText className="w-5 h-5" />} label="Files Analyzed" value={stats?.filesAnalyzed || 0} color="blue" />
                <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Coverage" value={`${stats?.avgQualityScore || 0}%`} color="green" />
                <StatCard icon={<Zap className="w-5 h-5" />} label="Recent Views" value={stats?.aiGenerations || 0} color="purple" />
                <StatCard icon={<Activity className="w-5 h-5" />} label="Weekly Trend" value={`${stats?.weeklyTrend || 0}%`} color="amber" />
            </div>

            <div className="bg-white/5 border-white/10 rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                    <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recent Activity
                    </h3>
                </div>
                <div className="divide-y">
                    {activity.length === 0 ? (
                        <div className="px-4 py-5 text-sm text-zinc-400">No activity yet.</div>
                    ) : (
                        activity.map((item) => (
                            <div key={item.id} className="px-4 py-3 hover:bg-white/5 transition-colors">
                                <p className="text-sm text-zinc-400">
                                    <span className="font-medium text-zinc-100">{item.action}</span>{" "}
                                    <span className="text-blue-600">{item.file}</span>
                                </p>
                                <p className="text-xs text-gray-400 mt-1">{item.time}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: "blue" | "green" | "purple" | "amber";
}) {
    const colors = {
        blue: "bg-blue-500/20 text-blue-400",
        green: "bg-green-500/20 text-green-400",
        purple: "bg-purple-500/20 text-purple-400",
        amber: "bg-amber-500/20 text-amber-400",
    };

    return (
        <div className="bg-white/5 border-white/10 rounded-xl border p-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
                {icon}
            </div>
            <p className="text-2xl font-bold text-zinc-100">{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
        </div>
    );
}
