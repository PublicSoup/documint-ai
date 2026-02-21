"use client";

import { useState, useEffect } from "react";
import { 
    ShieldAlert, AlertTriangle, Info, ShieldCheck, 
    ArrowRight, Loader2, Search, Filter, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";

interface SecurityInsight {
    fileId: string;
    fileName: string;
    insight: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    updatedAt: string;
}

interface SecurityData {
    insights: SecurityInsight[];
    stats: {
        total: number;
        critical: number;
        high: number;
    };
}

export function TeamSecurityAudit({ teamId }: { teamId: string }) {
    const [data, setData] = useState<SecurityData | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const fetchSecurity = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teams/${teamId}/security`);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (e) {
                console.error("Failed to fetch security audit:", e);
            } finally {
                setLoading(false);
            }
        };

        if (teamId) fetchSecurity();
    }, [teamId]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-32 bg-white/5 border border-white/10 rounded-3xl animate-pulse" />
                <div className="h-64 bg-white/5 border border-white/10 rounded-3xl animate-pulse" />
            </div>
        );
    }

    if (!data) return null;

    const filtered = data.insights.filter(i => 
        i.insight.toLowerCase().includes(search.toLowerCase()) || 
        i.fileName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 rounded-[2rem] bg-rose-500/5 border border-rose-500/10 flex flex-col items-center text-center">
                    <ShieldAlert className="w-8 h-8 text-rose-500 mb-2" />
                    <span className="text-3xl font-black text-white tracking-tighter">{data.stats.critical}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-500/70">Critical Risks</span>
                </div>
                <div className="p-6 rounded-[2rem] bg-amber-500/5 border border-amber-500/10 flex flex-col items-center text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                    <span className="text-3xl font-black text-white tracking-tighter">{data.stats.high}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/70">High Severity</span>
                </div>
                <div className="p-6 rounded-[2rem] bg-indigo-500/5 border border-indigo-500/10 flex flex-col items-center text-center">
                    <ShieldCheck className="w-8 h-8 text-indigo-500 mb-2" />
                    <span className="text-3xl font-black text-white tracking-tighter">{data.stats.total}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500/70">Total Findings</span>
                </div>
            </div>

            {/* Insight List */}
            <Card className="glass-card border-white/5 overflow-hidden">
                <CardHeader className="bg-white/[0.02] border-b border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5 text-rose-500" />
                                Security Vulnerability Report
                            </CardTitle>
                            <CardDescription className="text-xs">AI-identified security risks and architectural flaws</CardDescription>
                        </div>
                    </div>
                    
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-primary transition-colors" />
                        <input 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Filter by filename or risk description..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-zinc-600 font-medium"
                        />
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {filtered.length === 0 ? (
                        <div className="p-20 text-center space-y-3">
                            <ShieldCheck className="w-12 h-12 text-emerald-500/20 mx-auto" />
                            <p className="text-sm text-zinc-500 italic font-medium">No security vulnerabilities found.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {filtered.map((item, idx) => (
                                <div key={idx} className="p-4 hover:bg-white/[0.02] transition-all group flex items-start gap-4">
                                    <div className={cn(
                                        "mt-1 w-8 h-8 rounded-lg flex items-center justify-center border shrink-0",
                                        item.severity === "CRITICAL" ? "bg-red-500/10 border-red-500/20 text-red-500" :
                                        item.severity === "HIGH" ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
                                        "bg-blue-500/10 border-blue-500/20 text-blue-500"
                                    )}>
                                        {item.severity === "CRITICAL" ? <ShieldAlert className="w-4 h-4" /> : 
                                         item.severity === "HIGH" ? <AlertTriangle className="w-4 h-4" /> : 
                                         <Info className="w-4 h-4" />}
                                    </div>

                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-white truncate">{item.fileName}</span>
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-tighter",
                                                    item.severity === "CRITICAL" ? "bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.4)]" :
                                                    item.severity === "HIGH" ? "bg-amber-500 text-black" :
                                                    "bg-blue-500 text-white"
                                                )}>
                                                    {item.severity}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-zinc-600 font-bold whitespace-nowrap">
                                                {new Date(item.updatedAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        
                                        <p className="text-[13px] text-zinc-400 leading-relaxed pr-8">
                                            {item.insight}
                                        </p>

                                        <Link 
                                            href={`/dashboard?teamId=${teamId}&docId=${item.fileId}`}
                                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:text-white transition-colors"
                                        >
                                            View in IDE <ExternalLink className="w-2.5 h-2.5" />
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <p className="text-[9px] text-zinc-700 text-center uppercase font-black tracking-[0.3em] pb-4">
                Automated Security Shield v3.1 &bull; DocuMint AI
            </p>
        </div>
    );
}
