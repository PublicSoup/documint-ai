"use client";

import { useState, useEffect } from "react";
import { 
    AlertTriangle, Sparkles, Loader2, Info, 
    ChevronRight, Zap, Ghost
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface Hotspot {
    name: string;
    priority: "CRITICAL" | "HIGH" | "MEDIUM";
    reason: string;
}

interface DocDebtData {
    summary: string;
    hotspots: Hotspot[];
}

export function DocDebtCard({ teamId }: { teamId: string }) {
    const [data, setData] = useState<DocDebtData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDebt = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teams/${teamId}/doc-debt`);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (e) {
                console.error("Failed to fetch doc debt:", e);
            } finally {
                setLoading(false);
            }
        };

        if (teamId) fetchDebt();
    }, [teamId]);

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 h-[250px] animate-pulse flex flex-col gap-4">
                <div className="h-4 w-1/3 bg-white/10 rounded" />
                <div className="h-12 w-full bg-white/5 rounded" />
                <div className="space-y-2 mt-4">
                    <div className="h-8 w-full bg-white/5 rounded" />
                    <div className="h-8 w-full bg-white/5 rounded" />
                </div>
            </div>
        );
    }

    if (!data || data.hotspots.length === 0) {
        return (
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6 text-center space-y-3">
                <Ghost className="w-8 h-8 text-emerald-500/30 mx-auto" />
                <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">No Debt Detected</h3>
                <p className="text-xs text-emerald-500/60 leading-relaxed italic">
                    AI analysis suggests your project documentation is architecturally sound.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative group">
            {/* Glossy Header */}
            <div className="p-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">AI Debt Analysis</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Action Required
                </div>
            </div>

            <div className="p-6 space-y-6">
                <div className="space-y-2">
                    <p className="text-xs text-white/80 font-medium leading-relaxed border-l-2 border-primary/30 pl-3">
                        {data.summary}
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Critical Hotspots</label>
                    <div className="grid gap-2">
                        {data.hotspots.map((spot, i) => (
                            <div key={i} className="p-3 rounded-xl bg-black/40 border border-white/5 hover:border-white/10 transition-all flex items-start gap-3 group/item">
                                <div className={cn(
                                    "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                                    spot.priority === "CRITICAL" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" :
                                    spot.priority === "HIGH" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-blue-500"
                                )} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-white truncate">{spot.name}</span>
                                        <span className={cn(
                                            "text-[8px] font-black uppercase px-1 rounded",
                                            spot.priority === "CRITICAL" ? "text-red-400 bg-red-400/10" :
                                            spot.priority === "HIGH" ? "text-amber-400 bg-amber-400/10" : "text-blue-400 bg-blue-400/10"
                                        )}>
                                            {spot.priority}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 leading-snug line-clamp-2 italic">
                                        {spot.reason}
                                    </p>
                                </div>
                                <div className="ml-auto opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    <Zap className="w-3 h-3 text-primary" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2">
                    Start Targeted Documentation Loop
                    <ChevronRight className="w-3 h-3" />
                </button>
            </div>
            
            <div className="absolute bottom-0 right-0 p-1 opacity-5 pointer-events-none">
                <Sparkles className="w-20 h-20 text-white" />
            </div>
        </div>
    );
}
