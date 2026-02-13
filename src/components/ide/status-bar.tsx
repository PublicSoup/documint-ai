"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Zap, Database, CheckCircle2, ShieldCheck, GitBranch } from "lucide-react";

interface IDEStatusBarProps {
    fileCount: number;
    maxFiles: number;
    tokensUsed: number;
    maxTokens: number;
    plan: string;
    isSaving?: boolean;
    activeFile?: string;
    cursorLine?: number;
    cursorColumn?: number;
}

export function IDEStatusBar({
    fileCount,
    maxFiles,
    tokensUsed,
    maxTokens,
    plan,
    isSaving,
    activeFile,
    cursorLine = 1,
    cursorColumn = 1
}: IDEStatusBarProps) {
    const filePercentage = maxFiles === -1 ? 0 : (fileCount / maxFiles) * 100;
    const tokenPercentage = maxTokens === -1 ? 0 : (tokensUsed / maxTokens) * 100;

    const isFileLimitNear = filePercentage > 80;
    const isTokenLimitNear = tokenPercentage > 80;

    return (
        <div className="h-7 flex-none bg-gradient-to-r from-[#0c0c10] via-[#12121a] to-[#0c0c10] flex items-center justify-between px-3 text-[11px] text-white/70 select-none border-t border-white/[0.06] z-50 backdrop-blur-md">
            <div className="flex items-center gap-3 h-full">
                {/* Save Status */}
                <div className="flex items-center gap-1.5 min-w-[70px]">
                    {isSaving ? (
                        <>
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_6px_rgba(168,85,247,0.4)]" />
                            <span className="text-purple-300 font-medium">Saving...</span>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span className="text-white/50">Ready</span>
                        </>
                    )}
                </div>

                <div className="w-px h-3 bg-white/[0.06]" />

                {/* Plan Badge */}
                <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-purple-400/60" />
                    <span className="font-bold uppercase tracking-wider text-[10px] text-purple-300/80">{plan}</span>
                </div>

                <div className="w-px h-3 bg-white/[0.06]" />

                {/* Workspace Files Usage */}
                <div className="flex items-center gap-2 group cursor-help" title={`${fileCount} / ${maxFiles === -1 ? 'Unlimited' : maxFiles} files used`}>
                    <Database className={cn("w-3 h-3", isFileLimitNear ? "text-amber-400" : "text-white/25")} />
                    <span className="text-white/35 hidden sm:inline">Files</span>
                    {maxFiles !== -1 && (
                        <div className="w-14 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-700",
                                    isFileLimitNear
                                        ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                                        : "bg-gradient-to-r from-emerald-500/80 to-emerald-400/60"
                                )}
                                style={{ width: `${Math.min(filePercentage, 100)}%` }}
                            />
                        </div>
                    )}
                    <span className={cn("tabular-nums text-[10px]", isFileLimitNear ? "text-amber-300 font-bold" : "text-white/30")}>
                        {fileCount}{maxFiles !== -1 ? `/${maxFiles}` : ''}
                    </span>
                </div>

                <div className="w-px h-3 bg-white/[0.06]" />

                {/* AI Tokens Usage */}
                <div className="flex items-center gap-2 group cursor-help" title={`${tokensUsed} / ${maxTokens === -1 ? 'Unlimited' : maxTokens} AI tokens used`}>
                    <Zap className={cn("w-3 h-3", isTokenLimitNear ? "text-amber-400" : "text-purple-400/40")} />
                    <span className="text-white/35 hidden sm:inline">AI</span>
                    {maxTokens !== -1 && (
                        <div className="w-14 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-700",
                                    isTokenLimitNear
                                        ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                                        : "bg-gradient-to-r from-purple-500/80 to-violet-400/60"
                                )}
                                style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
                            />
                        </div>
                    )}
                    <span className={cn("tabular-nums text-[10px]", isTokenLimitNear ? "text-amber-300 font-bold" : "text-white/30")}>
                        {tokensUsed.toLocaleString()}{maxTokens !== -1 ? `/${maxTokens.toLocaleString()}` : ''}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-3 h-full">
                {/* Cursor Position — now uses real data */}
                {activeFile && (
                    <div className="hidden md:flex items-center gap-3 text-white/30 text-[10px] tabular-nums">
                        <span>Ln {cursorLine}, Col {cursorColumn}</span>
                        <span>Spaces: 2</span>
                        <span>UTF-8</span>
                    </div>
                )}

                <div className="w-px h-3 bg-white/[0.06]" />

                {/* Branch */}
                <div className="flex items-center gap-1.5 hover:bg-white/[0.04] px-2 h-full transition-colors cursor-pointer rounded">
                    <GitBranch className="w-3 h-3 text-white/25" />
                    <span className="text-white/40">main</span>
                </div>

                {/* Upgrade Nudge */}
                {(isFileLimitNear || isTokenLimitNear || plan.toLowerCase() === "free") && (
                    <button
                        onClick={() => window.location.href = '/checkout'}
                        className="bg-gradient-to-r from-purple-600 to-violet-500 hover:from-purple-500 hover:to-violet-400 text-white px-2.5 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider flex items-center gap-1 transition-all ml-1 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:shadow-[0_0_16px_rgba(139,92,246,0.5)]"
                    >
                        <Zap className="w-2.5 h-2.5 fill-current" />
                        Upgrade
                    </button>
                )}
            </div>
        </div>
    );
}