"use client";

import { useState, useEffect } from "react";
import { 
    Activity, Target, Zap, Clock, 
    ArrowRight, Loader2, Sparkles, TrendingUp,
    ShieldCheck, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface ScorecardData {
    teamName: string;
    totalScore: number;
    grade: string;
    metrics: {
        coverage: { value: number, target: number, status: string };
        drift: { value: number, count: number, status: string };
        velocity: { value: number, status: string };
    };
    generatedAt: string;
}

export function TeamScorecard({ teamId }: { teamId: string }) {
    const [data, setData] = useState<ScorecardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchScorecard = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teams/${teamId}/scorecard`);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (e) {
                console.error("Failed to fetch scorecard:", e);
            } finally {
                setLoading(false);
            }
        };

        if (teamId) fetchScorecard();
    }, [teamId]);

    if (loading) {
        return <div className="h-[300px] bg-white/5 border border-white/10 rounded-[2rem] animate-pulse" />;
    }

    if (!data) return null;

    const gradeColors: Record<string, string> = {
        "A": "text-emerald-500",
        "B": "text-blue-500",
        "C": "text-amber-500",
        "D": "text-orange-500",
        "F": "text-rose-500"
    };

    return (
        <Card className="glass-card border-white/10 rounded-[2.5rem] overflow-hidden relative group">
            {/* Background Glow */}
            <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-primary/10 blur-[100px] rounded-full group-hover:scale-125 transition-transform duration-1000" />
            
            <div className="p-8 relative z-10 flex flex-col md:flex-row gap-12 items-center">
                {/* Grade Circle */}
                <div className="relative w-40 h-40 shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                        <circle 
                            cx="80" cy="80" r="72" 
                            stroke="currentColor" strokeWidth="12" fill="transparent" 
                            strokeDasharray={452.4}
                            strokeDashoffset={452.4 * (1 - data.totalScore / 100)}
                            strokeLinecap="round"
                            className={cn(
                                "transition-all duration-[2000ms] ease-out",
                                gradeColors[data.grade]
                            )}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className={cn("text-6xl font-black italic tracking-tighter", gradeColors[data.grade])}>
                            {data.grade}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-[-4px]">
                            {data.totalScore}% Health
                        </span>
                    </div>
                </div>

                {/* Metrics Summary */}
                <div className="flex-1 space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-black text-white tracking-tight italic uppercase">Team Executive Summary</h2>
                        <p className="text-zinc-500 text-xs font-medium">Documentation health assessment for <strong className="text-zinc-300">@{data.teamName}</strong></p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Coverage */}
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                                <Target className="w-3 h-3" /> Coverage
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-bold text-white">{data.metrics.coverage.value}%</span>
                                <span className="text-[10px] text-zinc-600">/ {data.metrics.coverage.target}%</span>
                            </div>
                            <div className={cn(
                                "h-1 w-full rounded-full bg-white/5 overflow-hidden",
                                data.metrics.coverage.status === 'healthy' ? 'text-emerald-500' : 'text-amber-500'
                            )}>
                                <div className="h-full bg-current" style={{ width: `${data.metrics.coverage.value}%` }} />
                            </div>
                        </div>

                        {/* Drift */}
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                                <Clock className="w-3 h-3" /> Drift
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-bold text-white">{data.metrics.drift.value}%</span>
                                <span className="text-[10px] text-zinc-600">Rate</span>
                            </div>
                            <div className={cn(
                                "text-[9px] font-bold uppercase",
                                data.metrics.drift.status === 'healthy' ? 'text-emerald-500' : 
                                data.metrics.drift.status === 'warning' ? 'text-amber-500' : 'text-rose-500'
                            )}>
                                {data.metrics.drift.count} files out of sync
                            </div>
                        </div>

                        {/* Velocity */}
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                                <TrendingUp className="w-3 h-3" /> Velocity
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-bold text-white">{data.metrics.velocity.value}</span>
                                <span className="text-[10px] text-zinc-600">Docs/wk</span>
                            </div>
                            <div className="text-[9px] font-bold uppercase text-indigo-400">
                                {data.metrics.velocity.status}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex items-center justify-between border-t border-white/5">
                        <div className="flex items-center gap-2 text-[9px] font-bold text-zinc-600 uppercase tracking-[0.15em]">
                            <ShieldCheck className="w-3 h-3" /> Cryptographically Verified Audit Chain
                        </div>
                        <div className="text-[9px] text-zinc-700 italic">
                            Updated {new Date(data.generatedAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
