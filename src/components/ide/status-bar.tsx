"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Zap, Database, CheckCircle2, AlertTriangle, ShieldCheck, GitBranch, Cpu, HardDrive } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ProBadge } from "@/components/ui/pro-badge";

interface IDEStatusBarProps {
    fileCount: number;
    maxFiles: number;
    tokensUsed: number;
    maxTokens: number;
    plan: string;
    isSaving?: boolean;
    activeFile?: string;
}

export function IDEStatusBar({
    fileCount,
    maxFiles,
    tokensUsed,
    maxTokens,
    plan,
    isSaving,
    activeFile
}: IDEStatusBarProps) {
    const filePercentage = maxFiles === -1 ? 0 : (fileCount / maxFiles) * 100;
    const tokenPercentage = maxTokens === -1 ? 0 : (tokensUsed / maxTokens) * 100;

    const isFileLimitNear = filePercentage > 80;
    const isTokenLimitNear = tokenPercentage > 80;

    return (
        <div className="h-6 flex-none bg-[#007acc] flex items-center justify-between px-3 text-[11px] text-white/90 select-none border-t border-white/10 z-50">
            <div className="flex items-center gap-4 h-full">
                {/* Save Status */}
                <div className="flex items-center gap-1.5 min-w-[80px]">
                    {isSaving ? (
                        <>
                            <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse" />
                            <span>Saving...</span>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-300" />
                            <span>Ready</span>
                        </>
                    )}
                </div>

                <div className="w-px h-3 bg-white/20" />

                {/* Plan Info */}
                <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" />
                    <span className="font-bold uppercase tracking-tighter">{plan} Plan</span>
                </div>

                <div className="w-px h-3 bg-white/20" />

                {/* Workspace Files Usage */}
                <div className="flex items-center gap-2 group cursor-help" title={`${fileCount} / ${maxFiles === -1 ? 'Unlimited' : maxFiles} files used`}>
                    <Database className={cn("w-3 h-3", isFileLimitNear ? "text-amber-300" : "text-white/60")} />
                    <span>Workspace:</span>
                    {maxFiles !== -1 && (
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden inline-block align-middle">
                            <div
                                className={cn("h-full transition-all duration-500", isFileLimitNear ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "bg-emerald-400")}
                                style={{ width: `${Math.min(filePercentage, 100)}%` }}
                            />
                        </div>
                    )}
                    <span className={cn(isFileLimitNear && "text-amber-200 font-bold")}>
                        {fileCount}{maxFiles !== -1 ? `/${maxFiles}` : ''}
                    </span>
                </div>

                <div className="w-px h-3 bg-white/20" />

                {/* AI Tokens Usage */}
                <div className="flex items-center gap-2 group cursor-help" title={`${tokensUsed} / ${maxTokens === -1 ? 'Unlimited' : maxTokens} AI tokens used`}>
                    <Zap className={cn("w-3 h-3", isTokenLimitNear ? "text-amber-300" : "text-white/60")} />
                    <span>AI Engine:</span>
                    {maxTokens !== -1 && (
                        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden inline-block align-middle">
                            <div
                                className={cn("h-full transition-all duration-500", isTokenLimitNear ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "bg-purple-400")}
                                style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
                            />
                        </div>
                    )}
                    <span className={cn(isTokenLimitNear && "text-amber-200 font-bold")}>
                        {tokensUsed.toLocaleString()}{maxTokens !== -1 ? `/${maxTokens.toLocaleString()}` : ''}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-4 h-full">
                {/* File Meta */}
                {activeFile && (
                    <div className="hidden md:flex items-center gap-3 text-white/40 border-r border-white/10 pr-4">
                        <span>Ln {Math.floor(Math.random() * 50) + 1}, Col 1</span>
                        <span>Spaces: 4</span>
                        <span>UTF-8</span>
                    </div>
                )}

                {/* Branch */}
                <div className="flex items-center gap-1.5 hover:bg-white/10 px-2 h-full transition-colors cursor-pointer">
                    <GitBranch className="w-3 h-3 text-white/60" />
                    <span>main</span>
                </div>

                {/* Upgrade Nudge */}
                {(isFileLimitNear || isTokenLimitNear || plan.toLowerCase() === "free") && (
                    <button
                        onClick={() => window.location.href = '/checkout'}
                        className="bg-amber-500 hover:bg-amber-400 text-black px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider flex items-center gap-1 transition-colors ml-2"
                    >
                        <Zap className="w-2.5 h-2.5 fill-current" />
                        Upgrade
                    </button>
                )}
            </div>
        </div>
    );
}