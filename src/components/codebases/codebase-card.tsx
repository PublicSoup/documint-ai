"use client";

import Link from "next/link";
import {
    Github,
    Folder,
    RefreshCw,
    Loader2,
    CheckCircle2,
    FileCode2,
    Lock,
} from "lucide-react";
import type { SerializedCodebase } from "./codebases-shell";

/**
 * Single codebase card in the unified Codebases view.
 *
 * Links to the existing `?docId=…` deep link so the rest of the
 * dashboard (file tree, DocEditor) keeps working unchanged.
 */
export function CodebaseCard({
    codebase,
    canSyncGithub,
    isSyncing,
    onSync,
    teamId,
}: {
    codebase: SerializedCodebase;
    canSyncGithub: boolean;
    isSyncing: boolean;
    onSync: () => void;
    teamId: string | null;
}) {
    const isGithub = codebase.source === "GITHUB";
    const isPersonal = !isGithub && codebase.id.startsWith("personal:");

    const lastActivity = relativeTime(new Date(codebase.lastActivityAt));
    const sizeKb = Math.max(1, Math.round(codebase.totalSizeBytes / 1024));

    const href = isGithub
        ? `/dashboard?${teamId ? `teamId=${teamId}&` : ""}github=1`
        : `/dashboard?${teamId ? `teamId=${teamId}&` : ""}docId=${encodeURIComponent(codebase.id.split(":").pop() ?? codebase.id)}`;

    return (
        <Link
            href={href}
            className="group block p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/40 transition-colors"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div
                        className={
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 " +
                            (isGithub
                                ? "bg-white/10 text-white"
                                : "bg-primary/10 text-primary")
                        }
                    >
                        {isGithub ? <Github className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                            {codebase.name}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest font-black text-white/40">
                            {isGithub ? "GitHub" : isPersonal ? "Personal" : "Local"}
                        </p>
                    </div>
                </div>
                {codebase.archivedAt && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        Archived
                    </span>
                )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                <Metric
                    icon={<FileCode2 className="w-3 h-3" />}
                    label="files"
                    value={codebase.fileCount.toLocaleString()}
                />
                <Metric
                    label="size"
                    value={`${sizeKb} KB`}
                />
                <Metric
                    label="updated"
                    value={lastActivity}
                />
            </div>

            <div className="mt-3 flex items-center gap-2">
                {codebase.hasDocs ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400/90">
                        <CheckCircle2 className="w-3 h-3" />
                        {codebase.docsVerified ? "Verified" : "Drafted"}
                    </span>
                ) : (
                    <span className="text-[10px] font-bold text-white/30">No docs</span>
                )}

                <div className="ml-auto flex items-center gap-1">
                    {isGithub && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (canSyncGithub) onSync();
                            }}
                            disabled={!canSyncGithub || isSyncing}
                            className={
                                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-colors " +
                                (canSyncGithub
                                    ? "text-white/80 hover:bg-white/10"
                                    : "text-white/30 cursor-not-allowed")
                            }
                            aria-label="Sync from GitHub"
                        >
                            {isSyncing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : !canSyncGithub ? (
                                <Lock className="w-3 h-3" />
                            ) : (
                                <RefreshCw className="w-3 h-3" />
                            )}
                            Sync
                        </button>
                    )}
                </div>
            </div>
        </Link>
    );
}

function Metric({
    icon,
    label,
    value,
}: {
    icon?: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-lg bg-black/30 border border-white/5 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 flex items-center gap-1">
                {icon}
                {label}
            </p>
            <p className="text-[11px] font-bold text-white/80 mt-0.5 truncate">{value}</p>
        </div>
    );
}

function relativeTime(d: Date): string {
    const diffMs = Date.now() - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month}mo`;
    return `${Math.floor(month / 12)}y`;
}