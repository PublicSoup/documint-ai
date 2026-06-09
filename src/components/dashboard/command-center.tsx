"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    Sparkles,
    TrendingUp,
    GitBranch,
    Zap,
    Activity,
    AlertTriangle,
    Clock,
    FileText,
    FolderOpen,
    ArrowRight,
    BarChart3,
    Shield,
    Target,
    Users,
    CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import type { PriorityAction, Hotspot } from "@/app/dashboard/actions";
import GitHubImport from "@/components/github-import";
import FileUpload from "@/components/file-upload";

// ── Types ──────────────────────────────────────────────────────────────────

interface FileWithDocs {
    id: string;
    name: string;
    language: string;
    size: number;
    createdAt: Date;
    updatedAt: Date;
    documentation: {
        content: string;
        verifiedAt?: Date | null;
        status: string;
    } | null;
}

interface CommandCenterProps {
    teamId?: string;
    files: FileWithDocs[];
    priorityActions: PriorityAction[];
    hotspots: Hotspot[];
    subscription: { isPro: boolean; isTeam: boolean };
    totalFilesCount: number;
    verifiedDocsCount: number;
}

interface WorkspaceSummary {
    totalFiles: number;
    totalLOC: number;
    documentedCount: number;
    undocumentedCount: number;
    coveragePercent: number;
    avgRisk: number;
    criticalCount: number;
}

// ── Summary bar ────────────────────────────────────────────────────────────

function SummaryBar({ summary }: { summary: WorkspaceSummary | null }) {
    if (!summary) {
        return (
            <div className="h-[72px] rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
        );
    }

    const riskColor =
        summary.criticalCount > 0
            ? "text-rose-400"
            : summary.avgRisk > 50
              ? "text-amber-400"
              : "text-emerald-400";

    return (
        <div className="rounded-2xl bg-gradient-to-r from-white/[0.03] to-white/[0.01] border border-white/[0.06] p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold text-white">
                            {summary.totalFiles.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-white/30 uppercase tracking-wider">
                            files
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-bold text-white">
                            {summary.totalLOC >= 1000
                                ? `${(summary.totalLOC / 1000).toFixed(1)}k`
                                : summary.totalLOC.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-white/30 uppercase tracking-wider">
                            LOC
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm font-bold text-white">
                            {summary.coveragePercent}%
                        </span>
                        <span className="text-[10px] text-white/30 uppercase tracking-wider">
                            coverage
                        </span>
                    </div>
                    {summary.criticalCount > 0 && (
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                            <span className={cn("text-sm font-bold", riskColor)}>
                                {summary.criticalCount}
                            </span>
                            <span className="text-[10px] text-white/30 uppercase tracking-wider">
                                critical
                            </span>
                        </div>
                    )}
                </div>

                {/* Coverage bar */}
                <div className="flex items-center gap-3">
                    <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                summary.coveragePercent >= 80
                                    ? "bg-emerald-500"
                                    : summary.coveragePercent >= 50
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                            )}
                            style={{ width: `${summary.coveragePercent}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Priority action row ────────────────────────────────────────────────────

function PriorityActionRow({
    action,
    teamId,
}: {
    action: PriorityAction;
    teamId?: string;
}) {
    const priorityColors = {
        CRITICAL: "bg-rose-500",
        HIGH: "bg-amber-500",
        MEDIUM: "bg-yellow-500",
        LOW: "bg-zinc-400",
    };

    return (
        <Link
            href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${action.fileId}`}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
        >
            <div
                className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0 group-hover:scale-125 transition-transform",
                    priorityColors[action.priority],
                    action.priority === "CRITICAL" && "animate-pulse"
                )}
            />
            <span className="text-[11px] text-white/50 group-hover:text-white/70 transition-colors truncate flex-1">
                {action.label}
            </span>
            <ArrowRight className="w-3 h-3 text-white/15 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </Link>
    );
}

// ── Hotspot row ────────────────────────────────────────────────────────────

function HotspotRow({ hotspot, teamId }: { hotspot: Hotspot; teamId?: string }) {
    return (
        <Link
            href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${hotspot.id}`}
            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
        >
            <div className="flex items-center gap-3 min-w-0">
                <div
                    className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        hotspot.riskScore > 70
                            ? "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                            : hotspot.riskScore > 40
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                    )}
                />
                <span className="text-[11px] text-white/50 group-hover:text-white/70 transition-colors truncate">
                    {hotspot.name}
                </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {hotspot.isDocumented ? (
                    <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase">
                        Docs
                    </div>
                ) : (
                    <div className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase">
                        Missing
                    </div>
                )}
                <span className="text-[10px] font-bold text-zinc-500 w-6 text-right">
                    {hotspot.riskScore}
                </span>
            </div>
        </Link>
    );
}

// ── Recent file row ────────────────────────────────────────────────────────

function RecentFileRow({
    file,
    teamId,
}: {
    file: FileWithDocs;
    teamId?: string;
}) {
    const statusColor =
        file.documentation?.status === "APPROVED"
            ? "bg-emerald-500"
            : file.documentation?.status === "REVIEW"
              ? "bg-blue-500 animate-pulse"
              : file.documentation?.status === "DRAFT"
                ? "bg-amber-500"
                : "bg-white/20";

    return (
        <Link
            href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${file.id}`}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
        >
            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusColor)} />
            <span className="text-[11px] text-white/50 group-hover:text-white/70 transition-colors truncate flex-1">
                {file.name}
            </span>
            <span className="text-[9px] text-white/20 shrink-0">
                {file.updatedAt instanceof Date
                    ? formatDistanceToNow(file.updatedAt, { addSuffix: true })
                    : "recently"}
            </span>
        </Link>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

export function CommandCenter({
    teamId,
    files,
    priorityActions,
    hotspots,
    subscription,
    totalFilesCount,
    verifiedDocsCount,
}: CommandCenterProps) {
    const [summary, setSummary] = useState<WorkspaceSummary | null>(null);

    useEffect(() => {
        const params = new URLSearchParams();
        if (teamId) params.set("teamId", teamId);

        fetch(`/api/files/metrics?${params.toString()}`)
            .then((r) => r.json())
            .then((data: { summary: WorkspaceSummary }) => {
                if (data?.summary) setSummary(data.summary);
            })
            .catch(() => {
                // Fallback: compute from props
                setSummary({
                    totalFiles: totalFilesCount,
                    totalLOC: 0,
                    documentedCount: verifiedDocsCount,
                    undocumentedCount: totalFilesCount - verifiedDocsCount,
                    coveragePercent:
                        totalFilesCount > 0
                            ? Math.round((verifiedDocsCount / totalFilesCount) * 100)
                            : 0,
                    avgRisk: 0,
                    criticalCount: 0,
                });
            });
    }, [teamId, totalFilesCount, verifiedDocsCount]);

    // Sort files by updatedAt descending for "recent"
    const recentFiles = [...files]
        .sort((a, b) => {
            const dateA = a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt);
            const dateB = b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt);
            return dateB.getTime() - dateA.getTime();
        })
        .slice(0, 6);

    // Continue working: most recently updated file
    const continueWorking = recentFiles[0];

    return (
        <div className="space-y-5">
            {/* Summary Bar */}
            <SummaryBar summary={summary} />

            {/* Continue Working CTA */}
            {continueWorking && (
                <Link
                    href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${continueWorking.id}`}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 hover:bg-primary/15 transition-all group cursor-pointer"
                >
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/80">
                            Continue Working
                        </p>
                        <p className="text-sm font-bold text-white truncate mt-0.5">
                            {continueWorking.name}
                        </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-primary/50 group-hover:translate-x-1 transition-transform" />
                </Link>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-4">
                <Link
                    href={`/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${continueWorking?.id ?? ""}`}
                    className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-primary/30 transition-colors group cursor-pointer"
                >
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-xs font-bold text-white mb-1">Quick Analysis</h3>
                    <p className="text-[10px] text-white/30">Select a file for deep analysis</p>
                </Link>

                <GitHubImport />

                <Link
                    href={teamId ? `/dashboard/analytics?teamId=${teamId}` : "/dashboard/analytics"}
                    className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-purple-500/30 transition-colors group cursor-pointer"
                >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <BarChart3 className="w-4 h-4 text-purple-400" />
                    </div>
                    <h3 className="text-xs font-bold text-white mb-1">View Analytics</h3>
                    <p className="text-[10px] text-white/30">Workspace health and trends</p>
                </Link>
            </div>

            {/* AI Priority Queue + Recent Files */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Priority Queue */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                                AI Priority Queue
                            </span>
                        </div>
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold">
                            {priorityActions.length}
                        </span>
                    </div>
                    <div className="p-2 space-y-0.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                        {priorityActions.length > 0 ? (
                            priorityActions.map((action) => (
                                <PriorityActionRow
                                    key={action.id}
                                    action={action}
                                    teamId={teamId}
                                />
                            ))
                        ) : (
                            <p className="text-[10px] text-white/20 italic p-3 text-center">
                                No critical issues detected.
                            </p>
                        )}
                    </div>
                </div>

                {/* Recent Files */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                                Recent Files
                            </span>
                        </div>
                    </div>
                    <div className="p-2 space-y-0.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                        {recentFiles.length > 0 ? (
                            recentFiles.map((file) => (
                                <RecentFileRow key={file.id} file={file} teamId={teamId} />
                            ))
                        ) : (
                            <p className="text-[10px] text-white/20 italic p-3 text-center">
                                No files uploaded yet.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Hotspot Analysis */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                    <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-orange-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                            Hotspot Analysis
                        </span>
                    </div>
                    <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
                        Live
                    </span>
                </div>
                <div className="p-2 space-y-0.5 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {hotspots.length > 0 ? (
                        hotspots.map((hotspot) => (
                            <HotspotRow
                                key={hotspot.id}
                                hotspot={hotspot}
                                teamId={teamId}
                            />
                        ))
                    ) : (
                        <div className="flex items-center gap-2 justify-center p-4 text-[10px] text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="font-bold">Project is looking healthy</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Documentation Health */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                        Documentation Health
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                            <span className="text-xs text-white/50">
                                {verifiedDocsCount} of {totalFilesCount} files documented
                            </span>
                            <span className="text-xs text-white/30">
                                {totalFilesCount > 0
                                    ? `${Math.round((verifiedDocsCount / totalFilesCount) * 100)}%`
                                    : "0%"}
                            </span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                                style={{
                                    width: `${
                                        totalFilesCount > 0
                                            ? (verifiedDocsCount / totalFilesCount) * 100
                                            : 0
                                    }%`,
                                }}
                            />
                        </div>
                    </div>
                    <Link
                        href={teamId ? `/dashboard/analytics?teamId=${teamId}` : "/dashboard/analytics"}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-[10px] font-bold text-white/40 hover:bg-white/10 hover:text-white/60 transition-colors shrink-0"
                    >
                        <TrendingUp className="w-3 h-3" />
                        See Analytics
                    </Link>
                </div>
            </div>

            {/* Footer note */}
            <p className="text-center text-[10px] text-white/15 py-2">
                {totalFilesCount} files in workspace · Select a file from the explorer to begin deep analysis
            </p>
        </div>
    );
}