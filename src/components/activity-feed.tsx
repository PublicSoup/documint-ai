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

export default function ActivityFeed() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [activity, setActivity] = useState<RecentActivity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // In a real app, this would fetch from an API
                // For now, we'll use mock data
                setStats({
                    filesAnalyzed: 42,
                    avgQualityScore: 78,
                    aiGenerations: 156,
                    weeklyTrend: 12
                });

                setActivity([
                    { id: "1", action: "Analyzed", file: "api/users.py", time: "2 minutes ago" },
                    { id: "2", action: "Generated docs for", file: "auth.ts", time: "15 minutes ago" },
                    { id: "3", action: "Commented on", file: "utils/helpers.js", time: "1 hour ago" },
                    { id: "4", action: "Analyzed", file: "models/user.go", time: "3 hours ago" },
                ]);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-xl border p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                    <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                    <div className="h-3 bg-gray-200 rounded w-4/6"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    icon={<FileText className="w-5 h-5" />}
                    label="Files Analyzed"
                    value={stats?.filesAnalyzed || 0}
                    color="blue"
                />
                <StatCard
                    icon={<TrendingUp className="w-5 h-5" />}
                    label="Avg. Quality"
                    value={`${stats?.avgQualityScore || 0}%`}
                    color="green"
                />
                <StatCard
                    icon={<Zap className="w-5 h-5" />}
                    label="AI Generations"
                    value={stats?.aiGenerations || 0}
                    color="purple"
                />
                <StatCard
                    icon={<Activity className="w-5 h-5" />}
                    label="Weekly Trend"
                    value={`+${stats?.weeklyTrend || 0}%`}
                    color="amber"
                />
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Recent Activity
                    </h3>
                </div>
                <div className="divide-y">
                    {activity.map((item) => (
                        <div key={item.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                            <p className="text-sm text-gray-600">
                                <span className="font-medium text-gray-900">{item.action}</span>{" "}
                                <span className="text-blue-600">{item.file}</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{item.time}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    color
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: "blue" | "green" | "purple" | "amber";
}) {
    const colors = {
        blue: "bg-blue-50 text-blue-600",
        green: "bg-green-50 text-green-600",
        purple: "bg-purple-50 text-purple-600",
        amber: "bg-amber-50 text-amber-600"
    };

    return (
        <div className="bg-white rounded-xl border p-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${colors[color]}`}>
                {icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
        </div>
    );
}
