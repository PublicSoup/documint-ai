"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

export interface OpenRouterModel {
    id: string;
    name: string;
    contextLength: number | null;
    promptPrice: number | null;
    completionPrice: number | null;
}

interface OpenRouterModelPickerProps {
    value: string;
    onChange: (modelId: string) => void;
}

function formatContext(n: number | null): string | null {
    if (!n) return null;
    if (n >= 1000) return `${Math.round(n / 1000)}K ctx`;
    return `${n} ctx`;
}

function formatPrice(prompt: number | null): string | null {
    if (prompt === null) return null;
    if (prompt === 0) return "free";
    // OpenRouter prices are per-token; show per-million for readability.
    const perMillion = prompt * 1_000_000;
    return `$${perMillion >= 1 ? perMillion.toFixed(1) : perMillion.toFixed(2)}/M`;
}

/**
 * Searchable dropdown over OpenRouter's live model catalog, fetched via our
 * server proxy (/api/openrouter/models). Used when "OpenRouter" is the selected
 * provider so the user picks a concrete model instead of typing an id by hand.
 */
export function OpenRouterModelPicker({ value, onChange }: OpenRouterModelPickerProps) {
    const [open, setOpen] = useState(false);
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch the catalog once, lazily, the first time the dropdown is opened.
    const loadModels = async () => {
        if (models.length > 0 || loading) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/openrouter/models", { credentials: "include" });
            if (!res.ok) throw new Error(`Failed to load models (HTTP ${res.status})`);
            const data = (await res.json()) as { models: OpenRouterModel[] };
            setModels(data.models ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load models");
        } finally {
            setLoading(false);
        }
    };

    const toggleOpen = () => {
        const next = !open;
        setOpen(next);
        if (next) void loadModels();
    };

    // Close on outside click.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        const list = q
            ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
            : models;
        return list.slice(0, 100);
    }, [models, query]);

    const selected = models.find((m) => m.id === value);
    const label = selected?.name ?? value ?? "Select a model";

    return (
        <div ref={containerRef} className="relative min-w-0 flex-1">
            <button
                type="button"
                onClick={toggleOpen}
                title={value || "Select an OpenRouter model"}
                className="flex w-full items-center gap-2 rounded-md border border-indigo-500/30 bg-indigo-500/5 px-2.5 py-1.5 text-xs text-white/85 outline-none transition-colors hover:bg-indigo-500/10 focus:border-indigo-500/60"
            >
                <span className="truncate">{label}</span>
                <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-white/40" />
            </button>

            {open && (
                <div className="absolute bottom-full z-50 mb-1 w-full min-w-[260px] overflow-hidden rounded-xl border border-white/10 bg-[#161618] shadow-2xl">
                    <div className="flex items-center gap-2 border-b border-white/5 px-2.5 py-2">
                        <Search className="h-3.5 w-3.5 shrink-0 text-white/30" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search models…"
                            className="w-full bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none"
                        />
                    </div>

                    <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">
                        {loading && (
                            <div className="flex items-center gap-2 px-3 py-4 text-xs text-white/40">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading catalog…
                            </div>
                        )}
                        {error && !loading && (
                            <div className="px-3 py-4 text-xs text-red-400">{error}</div>
                        )}
                        {!loading && !error && filtered.length === 0 && (
                            <div className="px-3 py-4 text-xs text-white/40">No models match “{query}”.</div>
                        )}
                        {!loading && !error && filtered.map((m) => {
                            const ctx = formatContext(m.contextLength);
                            const price = formatPrice(m.promptPrice);
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(m.id);
                                        setOpen(false);
                                        setQuery("");
                                    }}
                                    className={
                                        "flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-white/5 " +
                                        (m.id === value ? "bg-white/5" : "")
                                    }
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-xs font-medium text-white/90">{m.name}</span>
                                            {m.id === value && <Check className="h-3 w-3 shrink-0 text-indigo-400" />}
                                        </div>
                                        <div className="truncate font-mono text-[10px] text-white/35">{m.id}</div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
                                        {ctx && <span className="text-[10px] text-white/40">{ctx}</span>}
                                        {price && (
                                            <span className={"text-[10px] " + (price === "free" ? "text-emerald-400" : "text-white/40")}>
                                                {price}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
