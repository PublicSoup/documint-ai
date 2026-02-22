"use client";

import { useState, useEffect } from "react";
import { 
    BarChart3, 
    TrendingUp, 
    Trophy, 
    Users, 
    Loader2, 
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Calendar,
    Award
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface TeamAnalyticsProps {
    teamId: string;
}

export function TeamAnalytics({ teamId }: TeamAnalyticsProps) {
    const [trends, setTrends] = useState<WeeklyTrends | null>(null);
    const [leaderboard, setLeaderboard] = useState<Contributor[]>([]);
    const [totalActivity, setTotalActivity] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchAnalytics = async () => {
            setLoading(true);
            setError("");
            try {
                const [trendsRes, leaderboardRes] = await Promise.all([
                    fetch(`/api/teams/${teamId}/weekly-summary`),
                    fetch(`/api/teams/${teamId}/leaderboard`)
                ]);

                if (!trendsRes.ok || !leaderboardRes.ok) {
                    throw new Error("Failed to fetch analytics data");
                }

                const trendsData = await trendsRes.json();
                const leaderboardData = await leaderboardRes.json();

                setTrends(trendsData.trends);
                setTotalActivity(trendsData.totalActivity);
                setLeaderboard(leaderboardData.leaderboard || []);
            } catch (err) {
                console.error("Team analytics error:", err);
                setError("Unable to load team analytics. Ensure you have a Pro subscription.");
            } finally {
                setLoading(false);
            }
        };

        if (teamId) fetchAnalytics();
    }, [teamId]);

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
            <div className="p-8 border border-white/5 bg-white/[0.02] rounded-3xl flex flex-col items-center justify-center text-center gap-3">
                <AlertCircle className="w-8 h-8 text-amber-500/50" />
                <p className="text-sm font-medium text-zinc-400 max-w-xs">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Weekly Creations Trend */}
                <Card className="glass-card border-white/5 bg-black/20">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Weekly Output</span>
                            </div>
                            <TrendBadge change={trends?.creations.change || 0} />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-white">{trends?.creations.current || 0}</span>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">New Docs</span>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-1">vs {trends?.creations.previous || 0} last week</p>
                    </CardContent>
                </Card>

                {/* Weekly Approvals Trend */}
                <Card className="glass-card border-white/5 bg-black/20">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Award className="w-4 h-4 text-purple-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Quality Velocity</span>
                            </div>
                            <TrendBadge change={trends?.approvals.change || 0} />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-white">{trends?.approvals.current || 0}</span>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase">Approvals</span>
                        </div>
                        <p className="text-[10px] text-zinc-600 mt-1">vs {trends?.approvals.previous || 0} last week</p>
                    </CardContent>
                </Card>
            </div>

            {/* Leaderboard */}
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
                                                <div className={cn(
                                                    "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black border border-black",
                                                    index === 0 ? "bg-amber-400 text-black" : 
                                                    index === 1 ? "bg-zinc-400 text-black" : 
                                                    "bg-orange-600 text-white"
                                                )}>
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
                                            <p className="text-[10px] font-black text-emerald-400">{Math.round((member.points / (totalActivity || 1)) * 100)}%</p>
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
                <Calendar className="w-3 h-3 text-zinc-600" />
                <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">
                    Last 30 Days of Team Momentum
                </p>
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
