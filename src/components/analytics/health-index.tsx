"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ShieldCheck, TrendingUp, AlertTriangle, Info } from "lucide-react";
import { motion } from "framer-motion";

interface CodeHealthIndexProps {
    score: number; // 0-100
    change?: number; // +/- percentage
    label?: string;
}

export function CodeHealthIndex({ score, change = 0, label = "Code Health Index" }: CodeHealthIndexProps) {
    const isHealthy = score > 80;
    const isWarning = score <= 80 && score > 50;
    const isCritical = score <= 50;

    const statusColor = isHealthy ? "text-emerald-400" : isWarning ? "text-amber-400" : "text-red-400";
    const statusBg = isHealthy ? "bg-emerald-500/10" : isWarning ? "bg-amber-500/10" : "bg-red-500/10";
    const statusBorder = isHealthy ? "border-emerald-500/20" : isWarning ? "border-amber-500/20" : "border-red-500/20";

    return (
        <div className={cn("relative p-6 rounded-3xl border glass-card group overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5", statusBorder)}>
            {/* Background Glow */}
            <div className={cn("absolute -top-24 -right-24 w-48 h-48 blur-[80px] rounded-full opacity-20 group-hover:opacity-30 transition-opacity duration-1000", isHealthy ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-red-500")} />

            <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{label}</h3>
                        <Info className="w-3 h-3 text-white/20 cursor-help" />
                    </div>
                    <div className="flex items-baseline gap-3">
                        <span className="text-5xl font-black tracking-tighter text-white">{score}%</span>
                        <div className={cn("flex items-center gap-1 text-xs font-bold", change >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {change >= 0 ? "+" : ""}{change}%
                            <TrendingUp className={cn("w-3 h-3", change < 0 && "rotate-180")} />
                        </div>
                    </div>
                </div>
                <div className={cn("p-3 rounded-2xl border flex items-center justify-center", statusBg, statusBorder)}>
                    {isHealthy ? <ShieldCheck className="w-6 h-6 text-emerald-400" /> : <AlertTriangle className="w-6 h-6 text-amber-400" />}
                </div>
            </div>

            {/* Precision Progress Bar */}
            <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-4 border border-white/5">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className={cn("h-full relative", isHealthy ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-red-500")}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/30 animate-shimmer" />
                </motion.div>
            </div>

            <div className="flex justify-between items-center text-[10px] font-medium tracking-tight text-white/30 relative z-10 uppercase">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                    <span>Integrity: Stable</span>
                </div>
                <div className="flex items-center gap-2">
                    <span>Target: 95%</span>
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                </div>
            </div>

            <style jsx global>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .animate-shimmer {
                    animation: shimmer 2s infinite linear;
                }
            `}</style>
        </div>
    );
}