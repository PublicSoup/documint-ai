"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Github,
    Folder,
    RefreshCw,
    Loader2,
    CheckCircle2,
    AlertCircle,
    FileCode2,
    Search,
} from "lucide-react";
import { CodebaseCard } from "./codebase-card";
import type { CodebaseSummary } from "@/lib/codebases/types";

/**
 * Serialized shape passed from the server view to the client shell.
 * Dates are ISO strings because server -> client boundary can't carry
 * Date objects.
 */
export interface SerializedCodebase extends Omit<CodebaseSummary, "lastActivityAt" | "archivedAt"> {
    lastActivityAt: string;
    archivedAt: string | null;
}

type SourceFilter = "ALL" | "LOCAL" | "GITHUB";
type SortKey = "recent" | "name" | "size";

export function CodebasesShell({
    initialItems,
    canSyncGithub,
    teamId,
}: {
    initialItems: SerializedCodebase[];
    canSyncGithub: boolean;
    teamId: string | null;
}) {
    const router = useRouter();
    const [items, setItems] = useState(initialItems);
    const [source, setSource] = useState<SourceFilter>("ALL");
    const [sort, setSort] = useState<SortKey>("recent");
    const [query, setQuery] = useState("");
    const [, startTransition] = useTransition();
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items
            .filter((i) => source === "ALL" || i.source === source)
            .filter((i) => !q || i.name.toLowerCase().includes(q))
            .sort((a, b) => {
                switch (sort) {
                    case "name":
                        return a.name.localeCompare(b.name);
                    case "size":
                        return b.totalSizeBytes - a.totalSizeBytes;
                    case "recent":
                    default:
                        return (
                            new Date(b.lastActivityAt).getTime() -
                            new Date(a.lastActivityAt).getTime()
                        );
                }
            });
    }, [items, source, sort, query]);

    const onSync = async (id: string) => {
        if (!canSyncGithub) return;
        setSyncingId(id);
        try {
            // Endpoint added in a follow-up. Until then we optimistically
            // bump the lastActivityAt and let the user know to refresh.
            setItems((prev) =>
                prev.map((i) =>
                    i.id === id
                        ? { ...i, lastActivityAt: new Date().toISOString() }
                        : i,
                ),
            );
            startTransition(() => router.refresh());
        } finally {
            setSyncingId(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Filter codebases…"
                        className="w-full pl-8 pr-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                </div>

                <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
                    {(["ALL", "LOCAL", "GITHUB"] as SourceFilter[]).map((s) => (
                        <button
                            key={s}
                            onClick={() => setSource(s)}
                            className={
                                "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors " +
                                (source === s
                                    ? "bg-primary text-white"
                                    : "text-white/50 hover:text-white")
                            }
                        >
                            {s}
                        </button>
                    ))}
                </div>

                <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 rounded-lg text-white/70 focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                    <option value="recent">Recent</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                </select>
            </div>

            {/* Grid */}
            {visible.length === 0 ? (
                <div className="p-8 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
                    No codebases match the current filter.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visible.map((c) => (
                        <CodebaseCard
                            key={c.id}
                            codebase={c}
                            canSyncGithub={canSyncGithub}
                            isSyncing={syncingId === c.id}
                            onSync={() => onSync(c.id)}
                            teamId={teamId}
                        />
                    ))}
                </div>
            )}

            <p className="text-[10px] text-white/30 text-center">
                {visible.length} of {items.length} codebases shown
            </p>
        </div>
    );
}