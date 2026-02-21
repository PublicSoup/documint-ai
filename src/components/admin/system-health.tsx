"use client";

import { useState, useEffect } from "react";
import { 
    Activity, Database, Cpu, ShieldCheck, 
    ShieldAlert, Zap, Loader2, CheckCircle2, 
    XCircle, AlertTriangle 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthData {
    status: string;
    timestamp: string;
    components: {
        database: { status: string; stats: { totalUsers: number } };
        ai: { status: string; provider: string };
        auditTrail: { status: string; tamperedCount: number };
        rateLimit: { status: string };
    };
}

export function SystemHealth() {
    const [data, setData] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchHealth = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/health");
            if (res.ok) {
                setData(await res.json());
            }
        } catch (e) {
            console.error("Health fetch failed", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 60000); // Auto refresh every minute
        return () => clearInterval(interval);
    }, []);

    if (loading && !data) {
        return (
            <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!data) return null;

    const StatusBadge = ({ status }: { status: string }) => {
        const isOnline = status === "online" || status === "intact" || status === "active" || status === "healthy";
        return (
            <div className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1",
                isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            )}>
                <div className={cn("w-1 h-1 rounded-full", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
                {status}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">System Infrastructure</h3>
                </div>
                <button 
                    onClick={fetchHealth}
                    className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                >
                    Refresh Status
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Database */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                        <Database className="w-4 h-4 text-blue-400" />
                        <StatusBadge status={data.components.database.status} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-white">PostgreSQL</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-tighter font-medium">Core Engine</p>
                    </div>
                </div>

                {/* AI Engine */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                        <Cpu className="w-4 h-4 text-purple-400" />
                        <StatusBadge status={data.components.ai.status} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-white">Google Gemini</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-tighter font-medium">Model: Flash 2.0</p>
                    </div>
                </div>

                {/* Audit Trail */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                        {data.components.auditTrail.status === "intact" ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        ) : (
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                        )}
                        <StatusBadge status={data.components.auditTrail.status} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-white">Audit Chain</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-tighter font-medium">SHA-256 Integrity</p>
                    </div>
                </div>

                {/* Rate Limiting */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <StatusBadge status={data.components.rateLimit.status} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-white">Upstash Redis</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-tighter font-medium">Traffic Shield</p>
                    </div>
                </div>
            </div>

            {data.components.auditTrail.status !== "intact" && (
                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-center gap-3 animate-pulse">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-rose-200 uppercase tracking-widest">Integrity Violation</p>
                        <p className="text-[11px] text-rose-500/80 leading-relaxed italic">
                            Cryptographic mismatch detected in recent audit logs. System integrity may be compromised.
                        </p>
                    </div>
                    <button className="px-3 py-1 bg-rose-500 text-white text-[10px] font-black rounded-lg uppercase">
                        Investigate
                    </button>
                </div>
            )}
        </div>
    );
}
