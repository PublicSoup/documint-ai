"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { 
    ChevronRight, 
    FileCode, 
    History, 
    Zap, 
    Share2, 
    Settings2, 
    Terminal, 
    Activity,
    ShieldCheck,
    Box
} from "lucide-react";
import { ProBadge } from "../ui/pro-badge";

interface ContextualHeaderProps {
    filePath?: string;
    riskScore?: number;
    isSaving?: boolean;
    onShare?: () => void;
    onSettings?: () => void;
}

export function ContextualHeader({
    filePath = "Select a file",
    riskScore = 0,
    isSaving,
    onShare,
    onSettings
}: ContextualHeaderProps) {
    const pathParts = filePath.split('/');
    const fileName = pathParts.pop();
    const folderPath = pathParts.join(' / ');

    return (
        <div className="h-12 flex-none border-b border-white/5 bg-[#1a1a1c]/80 backdrop-blur-md flex items-center justify-between px-4 z-40">
            <div className="flex items-center gap-4 overflow-hidden">
                {/* File Identity */}
                <div className="flex items-center gap-2 text-white/40">
                    <Box className="w-4 h-4" />
                    <div className="flex items-center text-[11px] font-medium tracking-tight whitespace-nowrap overflow-hidden">
                        <span className="hover:text-white/60 cursor-pointer transition-colors">workspace</span>
                        <ChevronRight className="w-3 h-3 mx-0.5 opacity-50" />
                        {folderPath && (
                            <>
                                <span className="hover:text-white/60 cursor-pointer transition-colors truncate max-w-[150px]">{folderPath}</span>
                                <ChevronRight className="w-3 h-3 mx-0.5 opacity-50" />
                            </>
                        )}
                        <span className="text-white font-bold">{fileName}</span>
                    </div>
                </div>

                <div className="w-px h-4 bg-white/5" />

                {/* Real-time Health Metric */}
                <div className="flex items-center gap-2 group cursor-help">
                    <div className={cn(
                        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all duration-500",
                        riskScore > 70 ? "bg-red-500/10 border-red-500/20 text-red-400" :
                        riskScore > 40 ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                        "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    )}>
                        <Activity className="w-3 h-3 animate-pulse-slow" />
                        <span>COMPLEXITY: {riskScore}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                {/* Collaboration Tools */}
                <div className="flex -space-x-2 mr-4 overflow-hidden">
                    {[1, 2].map((i) => (
                        <div key={i} className="w-6 h-6 rounded-full border-2 border-[#1a1a1c] bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[8px] font-bold text-white shadow-xl">
                            {i === 1 ? 'JD' : 'AI'}
                        </div>
                    ))}
                    <div className="w-6 h-6 rounded-full border-2 border-[#1a1a1c] bg-zinc-800 flex items-center justify-center text-[8px] font-bold text-white/40 hover:bg-zinc-700 cursor-pointer">
                        +
                    </div>
                </div>

                <button 
                    onClick={onShare}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-all active:scale-95"
                    title="Live Share Session"
                >
                    <Share2 className="w-4 h-4" />
                </button>
                
                <button 
                    onClick={onSettings}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-all active:scale-95"
                    title="IDE Configuration"
                >
                    <Settings2 className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-white/5 mx-1" />

                <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Protected Mode</span>
                </div>
            </div>

            <style jsx global>{`
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 3s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
}