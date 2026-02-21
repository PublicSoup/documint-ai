"use client";

import { useState, useEffect } from "react";
import { 
    Users, Target, AlertCircle, TrendingUp, 
    ArrowUpRight, FileText, CheckCircle2, Loader2, Sparkles 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { CodeHealthIndex } from "./health-index";
import { DocDebtCard } from "./doc-debt-card";
import Link from "next/link";

interface TeamOverviewData {
    teamInfo?: {
        name: string;
        memberCount: number;
        coverageGoal: number;
    };
    coverage: {
        documented: number;
        total: number;
        percentage: number;
    };
    staleDocs: {
        id: string;
        name: string;
        reason: string;
    }[];
}

export function TeamProjectOverview({ teamId }: { teamId?: string }) {
    const [data, setData] = useState<TeamOverviewData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOverview = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ days: "30" });
                if (teamId) params.set("teamId", teamId);
                const res = await fetch(`/api/analytics/docs?${params.toString()}`);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (e) {
                console.error("Failed to fetch team overview:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchOverview();
    }, [teamId]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[200px]">
                <div className="lg:col-span-5 bg-white/5 border border-white/10 rounded-3xl animate-pulse" />
                <div className="lg:col-span-7 bg-white/5 border border-white/10 rounded-3xl animate-pulse" />
            </div>
        );
    }

    if (!data) return null;

    const coverageGoal = data.teamInfo?.coverageGoal || 80;
    const isAboveGoal = data.coverage.percentage >= coverageGoal;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Health Index - Enhanced with Team Context */}
                <div className="lg:col-span-5 h-full">
                    <CodeHealthIndex 
                        score={data.coverage.percentage} 
                        change={5} 
                        label={data.teamInfo ? `${data.teamInfo.name} Health` : "Personal Health Index"}
                    />
                </div>

                {/* Team Summary Cards */}
                <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                    {/* Coverage vs Target */}
                    <Card className="glass-card border-white/5 bg-gradient-to-br from-indigo-500/5 to-transparent relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <Target className="w-12 h-12 text-indigo-400" />
                        </div>
                        <CardContent className="p-6">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Documentation Target</p>
                            <div className="flex items-baseline gap-2 mb-4">
                                <h3 className="text-3xl font-black text-white tracking-tighter">{data.coverage.percentage}%</h3>
                                <span className="text-xs text-zinc-500 font-bold">/ {coverageGoal}% Goal</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter",
                                    isAboveGoal ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                                )}>
                                    {isAboveGoal ? "Target Achieved" : `${coverageGoal - data.coverage.percentage}% Remaining`}
                                </div>
                                {data.teamInfo && (
                                    <div className="flex items-center gap-1.5 ml-auto text-[10px] font-bold text-zinc-500">
                                        <Users className="w-3 h-3" />
                                        {data.teamInfo.memberCount} Members
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* AI Documentation Debt Hotspots */}
                    {teamId && <DocDebtCard teamId={teamId} />}
                    {!teamId && (
                        <Card className="glass-card border-white/5 bg-gradient-to-br from-rose-500/5 to-transparent relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                <AlertCircle className="w-12 h-12 text-rose-400" />
                            </div>
                            <CardContent className="p-6">
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Attention Required</p>
                                <h3 className="text-3xl font-black text-white tracking-tighter mb-4">{data.staleDocs.length} Stale Files</h3>
                                
                                <div className="space-y-2">
                                    {data.staleDocs.slice(0, 2).map(doc => (
                                        <div key={doc.id} className="flex items-center justify-between group/item">
                                            <span className="text-[11px] text-white/60 truncate max-w-[150px]">{doc.name}</span>
                                            <span className="text-[9px] font-bold text-rose-400 uppercase tracking-tighter shrink-0">{doc.reason.replace('_', ' ')}</span>
                                        </div>
                                    ))}
                                    {data.staleDocs.length > 2 && (
                                        <p className="text-[10px] text-zinc-500 italic mt-1">+ {data.staleDocs.length - 2} more files...</p>
                                    )}
                                    {data.staleDocs.length === 0 && (
                                        <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-bold">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Project is fully synchronized
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
