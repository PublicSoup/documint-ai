"use client";

import { useState, useEffect } from "react";
import {
    BarChart3, Eye, Clock, FileText, TrendingUp,
    AlertCircle, CheckCircle, Loader2, Calendar
} from "lucide-react";

interface AnalyticsData {
    overview: {
        totalFiles: number;
        totalViews: number;
        avgViewDuration: number;
        docsCreatedThisMonth: number;
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
    }[];
    recentActivity: {
        date: string;
        views: number;
        creations: number;
    }[];
    coverage: {
        documented: number;
        total: number;
        percentage: number;
    };
}

export default function AnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState(30);

    useEffect(() => {
        const fetchAnalytics = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/analytics/docs?days=${timeRange}`);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (e) {
                console.error("Failed to fetch analytics:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, [timeRange]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="text-center text-gray-500 py-12">
                Failed to load analytics data
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
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-purple-600" />
                        Documentation Analytics
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Insights into your documentation usage and health
                    </p>
                </div>
                <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(Number(e.target.value))}
                    className="px-4 py-2 border rounded-lg bg-white text-sm"
                >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                </select>
            </div>

            {/* Overview Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{data.overview.totalFiles}</p>
                            <p className="text-sm text-gray-500">Total Files</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                            <Eye className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{data.overview.totalViews}</p>
                            <p className="text-sm text-gray-500">Total Views</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{data.overview.avgViewDuration}s</p>
                            <p className="text-sm text-gray-500">Avg. Duration</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{data.overview.docsCreatedThisMonth}</p>
                            <p className="text-sm text-gray-500">Created This Month</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Coverage & Activity Row */}
            <div className="grid grid-cols-2 gap-6">
                {/* Coverage */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
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
                            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-gray-900">
                                {data.coverage.percentage}%
                            </span>
                        </div>
                        <div>
                            <p className="text-gray-600">
                                <span className="font-semibold text-gray-900">{data.coverage.documented}</span> of {data.coverage.total} files documented
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
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
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

            {/* Top & Stale Docs */}
            <div className="grid grid-cols-2 gap-6">
                {/* Top Documents */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-500" />
                        Most Viewed Docs
                    </h3>
                    {data.topDocs.length > 0 ? (
                        <div className="space-y-3">
                            {data.topDocs.map((doc, i) => (
                                <div key={doc.id} className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                                        <p className="text-xs text-gray-500">{doc.language}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-gray-900">{doc.views}</p>
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
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        Stale Documentation
                    </h3>
                    {data.staleDocs.length > 0 ? (
                        <div className="space-y-3">
                            {data.staleDocs.map((doc) => (
                                <div key={doc.id} className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-amber-600 font-semibold">{doc.daysSinceUpdate}d</p>
                                        <p className="text-xs text-gray-500">since update</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-green-600 text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            All docs are up to date!
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
