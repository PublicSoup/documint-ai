"use client";

import { useState, useEffect } from "react";
import { 
    ShieldCheck, Sparkles, Loader2, AlertCircle, 
    CheckCircle2, TrendingUp, HelpCircle, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { useToast } from "./toast";

interface AuditResult {
    score: number;
    consistency: string;
    completeness: string;
    apiDesignCompliance?: string;
    strengths: string[];
    weaknesses: string[];
    recommendation: string;
}

export function TeamAIAudit({ teamId }: { teamId: string }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AuditResult | null>(null);
    const [history, setHistory] = useState<{ date: string; score: number }[]>([]);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await fetch(`/api/teams/${teamId}/audit`);
                if (res.ok) {
                    const data = await res.json();
                    setHistory(data.history || []);
                }
            } catch (e) {}
        };
        if (teamId) fetchHistory();
    }, [teamId, result]);

    const handleRunAudit = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/teams/${teamId}/audit`, {
                method: "POST",
            });

            if (res.ok) {
                const data = await res.json();
                setResult(data);
                toast("AI Documentation Audit Complete", "success");
            } else {
                const err = await res.json();
                toast(err.error || "Failed to run audit", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Audit failed due to a network error", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="glass-card border-white/5 relative overflow-hidden group">
            {/* Glossy Background Effect */}
            <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-[100px] rounded-full pointer-events-none group-hover:bg-primary/10 transition-colors duration-700" />
            
            <CardHeader className="pb-4 relative z-10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                AI Project Audit
                                <span className="text-[10px] bg-primary text-white px-1.5 py-0.5 rounded font-black italic">PRO</span>
                            </CardTitle>
                            <CardDescription className="text-xs">Deep analysis of project-wide documentation quality</CardDescription>
                        </div>
                    </div>
                    {!result && (
                        <Button 
                            onClick={handleRunAudit} 
                            disabled={loading}
                            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl h-9 px-4 gap-2"
                        >
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            Run Audit
                        </Button>
                    )}
                </div>
            </CardHeader>

            <CardContent className="relative z-10 pt-0">
                {!result ? (
                    <div className="p-8 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                        <HelpCircle className="w-8 h-8 text-zinc-800 mx-auto mb-3" />
                        <p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                            Analyze consistency, tone, and completeness across all team documents. This action takes ~15 seconds.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Summary Score Row */}
                        <div className="flex items-center gap-6 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                            <div className="relative w-16 h-16 shrink-0">
                                <svg className="w-16 h-16 transform -rotate-90">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/5" />
                                    <circle 
                                        cx="32" cy="32" r="28" 
                                        stroke="currentColor" strokeWidth="4" fill="transparent" 
                                        strokeDasharray={175.9}
                                        strokeDashoffset={175.9 * (1 - result.score / 100)}
                                        className={cn(
                                            "transition-all duration-1000 ease-out",
                                            result.score >= 80 ? "text-emerald-500" : result.score >= 50 ? "text-amber-500" : "text-rose-500"
                                        )}
                                    />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center font-black text-white text-sm italic">{result.score}%</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-white mb-1 uppercase tracking-tighter italic">Strategic Recommendation</h4>
                                <p className="text-xs text-zinc-400 leading-relaxed italic line-clamp-2">
                                    "{result.recommendation}"
                                </p>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-emerald-500 tracking-widest px-1">Strengths</label>
                                <div className="space-y-2">
                                    {result.strengths.map((s, i) => (
                                        <div key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                            <span>{s}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-amber-500 tracking-widest px-1">Weaknesses</label>
                                <div className="space-y-2">
                                    {result.weaknesses.map((w, i) => (
                                        <div key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                            <span>{w}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                            <div>
                                <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Consistency</h5>
                                <p className="text-[11px] text-zinc-400 leading-relaxed">{result.consistency}</p>
                            </div>
                            <div>
                                <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Completeness</h5>
                                <p className="text-[11px] text-zinc-400 leading-relaxed">{result.completeness}</p>
                            </div>
                        </div>

                        {result.apiDesignCompliance && result.apiDesignCompliance !== "N/A" && (
                            <div className="border-t border-white/5 pt-4">
                                <h5 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">API Design Compliance</h5>
                                <p className="text-[11px] text-zinc-400 leading-relaxed italic">{result.apiDesignCompliance}</p>
                            </div>
                        )}

                        {/* Trend Visualization */}
                        {history.length > 1 && (
                            <div className="border-t border-white/5 pt-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Health Trend</h5>
                                    <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500 uppercase">
                                        <TrendingUp className="w-3 h-3" />
                                        +{history[history.length - 1].score - history[0].score}%
                                    </div>
                                </div>
                                <div className="flex items-end gap-1 h-12">
                                    {history.map((h, i) => (
                                        <div 
                                            key={i} 
                                            className="flex-1 bg-primary/20 rounded-t hover:bg-primary/40 transition-colors relative group/bar"
                                            style={{ height: `${Math.max(h.score, 10)}%` }}
                                        >
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[8px] font-bold text-white opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                                {h.score}% • {h.date}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleRunAudit}
                                disabled={loading}
                                className="text-[10px] font-bold text-zinc-600 hover:text-white transition-colors gap-2"
                            >
                                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                RE-RUN FULL AUDIT
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

import { RefreshCw } from "lucide-react";
