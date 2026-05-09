"use client";

import React, { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Zap, Database, CheckCircle2, ShieldCheck, GitBranch, RefreshCw } from "lucide-react";
import { useToast } from "@/components/toast";

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

function parseGitStatus(rawStatus: string): { branch: string; dirty: boolean } {
    const lines = rawStatus
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const head = lines[0] || "";
    if (!head.startsWith("## ")) {
        return { branch: "main", dirty: lines.length > 0 };
    }

    const branch = head.slice(3).split("...")[0]?.trim() || "main";
    const dirty = lines.length > 1;
    return { branch, dirty };
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
    cursorColumn = 1,
}: IDEStatusBarProps) {
    const { toast } = useToast();
    const [gitBranch, setGitBranch] = useState("main");
    const [gitDirty, setGitDirty] = useState(false);
    const [syncingGit, setSyncingGit] = useState(false);

    const fetchGitStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/git/status", { cache: "no-store" });
            if (!res.ok) return;

            const data = (await res.json()) as { status?: string };
            if (!data.status) return;

            const parsed = parseGitStatus(data.status);
            setGitBranch(parsed.branch);
            setGitDirty(parsed.dirty);
        } catch {
            // Non-blocking status widget
        }
    }, []);

    useEffect(() => {
        void fetchGitStatus();
        const timer = setInterval(() => {
            void fetchGitStatus();
        }, 30_000);
        return () => clearInterval(timer);
    }, [fetchGitStatus]);

    const handleGitSync = useCallback(async () => {
        if (syncingGit) return;
        setSyncingGit(true);

        try {
            const res = await fetch("/api/git/sync", { method: "POST" });
            const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };

            if (!res.ok) {
                toast(data.error || "Git sync failed", "error");
                return;
            }

            if (data.status) {
                const parsed = parseGitStatus(data.status);
                setGitBranch(parsed.branch);
                setGitDirty(parsed.dirty);
            } else {
                await fetchGitStatus();
            }

            toast("Git sync completed", "success");
        } catch {
            toast("Git sync failed", "error");
        } finally {
            setSyncingGit(false);
        }
    }, [fetchGitStatus, syncingGit, toast]);

    const filePercentage = maxFiles === -1 ? 0 : (fileCount / maxFiles) * 100;
    const tokenPercentage = maxTokens === -1 ? 0 : (tokensUsed / maxTokens) * 100;

    const isFileLimitNear = filePercentage > 80;
    const isTokenLimitNear = tokenPercentage > 80;

    return (
        <div className="h-7 flex-none bg-gradient-to-r from-[#04001a] via-[#08002a] to-[#04001a] flex items-center justify-between px-3 text-[11px] text-white/70 select-none border-t border-white/[0.06] z-50 backdrop-blur-md">
            <div className="flex items-center gap-3 h-full">
                <div className="flex items-center gap-1.5 min-w-[70px]">
                    {isSaving ? (
                        <>
                            <div className="w-2 h-2 rounded-full bg-purple-400" />
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

                <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-purple-400/60" />
                    <span className="font-bold uppercase tracking-wider text-[10px] text-purple-300/80">{plan}</span>
                </div>

                <div className="w-px h-3 bg-white/[0.06]" />

                <div className="flex items-center gap-2 group cursor-help" title={`${fileCount} / ${maxFiles === -1 ? "Unlimited" : maxFiles} files used`}>
                    <Database className={cn("w-3 h-3", isFileLimitNear ? "text-amber-400" : "text-white/25")} />
                    <span className="text-white/35 hidden sm:inline">Files</span>
                    {maxFiles !== -1 && (
                        <div className="w-14 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-700",
                                    isFileLimitNear
                                        ? "bg-amber-500"
                                        : "bg-emerald-500/80",
                                )}
                                style={{ width: `${Math.min(filePercentage, 100)}%` }}
                            />
                        </div>
                    )}
                    <span className={cn("tabular-nums text-[10px]", isFileLimitNear ? "text-amber-300 font-bold" : "text-white/30")}>
                        {fileCount}
                        {maxFiles !== -1 ? `/${maxFiles}` : ""}
                    </span>
                </div>

                <div className="w-px h-3 bg-white/[0.06]" />

                <div className="flex items-center gap-2 group cursor-help" title={`${tokensUsed} / ${maxTokens === -1 ? "Unlimited" : maxTokens} AI tokens used`}>
                    <Zap className={cn("w-3 h-3", isTokenLimitNear ? "text-amber-400" : "text-purple-400/40")} />
                    <span className="text-white/35 hidden sm:inline">AI</span>
                    {maxTokens !== -1 && (
                        <div className="w-14 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all duration-700",
                                    isTokenLimitNear
                                        ? "bg-amber-500"
                                        : "bg-purple-500/80",
                                )}
                                style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
                            />
                        </div>
                    )}
                    <span className={cn("tabular-nums text-[10px]", isTokenLimitNear ? "text-amber-300 font-bold" : "text-white/30")}>
                        {tokensUsed.toLocaleString()}
                        {maxTokens !== -1 ? `/${maxTokens.toLocaleString()}` : ""}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-3 h-full">
                {activeFile && (
                    <div className="hidden md:flex items-center gap-3 text-white/30 text-[10px] tabular-nums">
                        <span>Ln {cursorLine}, Col {cursorColumn}</span>
                        <span>Spaces: 2</span>
                        <span>UTF-8</span>
                    </div>
                )}

                <div className="w-px h-3 bg-white/[0.06]" />

                <button
                    type="button"
                    onClick={() => void handleGitSync()}
                    disabled={syncingGit}
                    className="flex items-center gap-1.5 hover:bg-white/[0.04] px-2 h-full transition-colors cursor-pointer rounded disabled:opacity-60 disabled:cursor-wait"
                    title={syncingGit ? "Syncing git..." : "Sync repository"}
                >
                    {syncingGit ? (
                        <RefreshCw className="w-3 h-3 text-purple-300 animate-spin" />
                    ) : (
                        <GitBranch className={cn("w-3 h-3", gitDirty ? "text-amber-300" : "text-white/25")} />
                    )}
                    <span className={cn(gitDirty ? "text-amber-300" : "text-white/40")}>{gitBranch}</span>
                </button>

                {(isFileLimitNear || isTokenLimitNear || plan.toLowerCase() === "free") && (
                    <button
                        type="button"
                        onClick={() => {
                            window.location.href = "/checkout";
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider flex items-center gap-1 transition-all ml-1"
                    >
                        <Zap className="w-2.5 h-2.5 fill-current" />
                        Upgrade
                    </button>
                )}
            </div>
        </div>
    );
}
