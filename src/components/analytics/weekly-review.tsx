"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { 
    Calendar, TrendingUp, TrendingDown,
    Sparkles, ArrowRight, Award
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface WeeklySummary {
    trends: {
        creations: { current: number; previous: number; change: number };
        approvals: { current: number; previous: number; change: number };
    };
    topContributors: { name: string; image: string | null; count: number }[];
    totalActivity: number;
}

export function TeamWeeklyReview({ teamId }: { teamId: string }) {
    const [data, setData] = useState<WeeklySummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teams/${teamId}/weekly-summary`);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (error) {
                console.error("Failed to fetch weekly summary:", error);
            } finally {
                setLoading(false);
            }
        };

        if (teamId) fetchSummary();
    }, [teamId]);

    if (loading) {
        return <div className="h-[300px] bg-white/5 border border-white/10 rounded-3xl animate-pulse" />;
    }

    if (!data || data.totalActivity === 0) return null;

    return (
        <Card className="glass-card border-white/5 overflow-hidden relative group">
            <div className="p-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Weekly Review</span>
                </div>
                <div className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase">
                    Last 7 Days
                </div>
            </div>

            <CardContent className="p-6 space-y-8">
                {/* Trends Grid */}
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">New Docs</p>
                        <div className="flex items-baseline gap-3">
                            <span className="text-3xl font-black text-white">{data.trends.creations.current}</span>
                            <div className={cn(
                                "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                                data.trends.creations.change >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                            )}>
                                {data.trends.creations.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {Math.abs(data.trends.creations.change)}%
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Approvals</p>
                        <div className="flex items-baseline gap-3">
                            <span className="text-3xl font-black text-white">{data.trends.approvals.current}</span>
                            <div className={cn(
                                "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                                data.trends.approvals.change >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                            )}>
                                {data.trends.approvals.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {Math.abs(data.trends.approvals.change)}%
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Contributors */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Top Contributors</span>
                    </div>
                    
                    <div className="space-y-2">
                        {data.topContributors.map((user, i) => (
                            <div key={i} className="flex items-center justify-between group/user">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-white/5 flex items-center justify-center overflow-hidden shrink-0">
                                        {user.image ? (
                                            <Image
                                                src={user.image}
                                                alt={`${user.name} avatar`}
                                                width={28}
                                                height={28}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-[10px] font-bold">{user.name[0]}</span>
                                        )}
                                    </div>
                                    <span className="text-xs font-bold text-white/80 group-hover/user:text-white transition-colors">{user.name}</span>
                                </div>
                                <div className="text-[10px] font-black text-primary uppercase tracking-tighter italic">
                                    {user.count} Contributions
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-2 border-t border-white/5">
                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between group/cta cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-white">Team velocity is up</p>
                                <p className="text-[9px] text-zinc-500 uppercase font-black">Keep the momentum going</p>
                            </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-zinc-700 group-hover/cta:translate-x-1 group-hover/cta:text-primary transition-all" />
                    </div>
                </div>
            </CardContent>
            
            {/* Ambient Background Flair */}
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary/10 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        </Card>
    );
}
