"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, FileCode, Loader2, X, Command, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import FileCodeIcon from "./file-code-icon";

interface SearchResult {
    id: string;
    name: string;
    language: string;
    updatedAt: string;
    documentation?: {
        status: string;
    };
}

export function GlobalSearch({ teamId }: { teamId?: string }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    // Toggle with CMD+K
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const performSearch = useCallback(async (q: string) => {
        if (q.length < 2) {
            setResults([]);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ q });
            if (teamId) params.set("teamId", teamId);
            
            const res = await fetch(`/api/files/search?${params}`);
            const data = (await res.json().catch(() => ({}))) as { results?: SearchResult[]; error?: string };

            if (!res.ok) {
                setResults([]);
                setError(data.error || "Search failed. Please try again.");
                return;
            }

            setResults(data.results || []);
        } catch (error) {
            console.error("Search failed:", error);
            setResults([]);
            setError("Search failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [teamId]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            performSearch(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, performSearch]);

    const handleSelect = (id: string) => {
        const baseUrl = teamId ? `/dashboard?teamId=${teamId}` : "/dashboard";
        const separator = baseUrl.includes("?") ? "&" : "?";
        router.push(`${baseUrl}${separator}docId=${id}`);
        setOpen(false);
        setQuery("");
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white transition-all group min-w-[200px]"
            >
                <Search className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
                <span>Search project...</span>
                <div className="ml-auto flex items-center gap-1 opacity-50">
                    <Command className="w-2.5 h-2.5" />
                    <span>K</span>
                </div>
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            
            <div className="relative w-full max-w-xl bg-[#0A0A0B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Input Header */}
                <div className="flex items-center px-4 border-b border-white/10 bg-white/5">
                    <Search className="w-4 h-4 text-zinc-400" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search filenames or code content..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white py-4 px-3 placeholder:text-zinc-500"
                    />
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    ) : query ? (
                        <button onClick={() => setQuery("")} className="p-1 hover:bg-white/10 rounded-md transition-colors">
                            <X className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                    ) : (
                        <div className="text-[10px] font-bold text-zinc-500 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">ESC</div>
                    )}
                </div>

                {/* Results List */}
                <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
                    {query.length < 2 ? (
                        <div className="p-8 text-center space-y-2">
                            <Command className="w-8 h-8 text-zinc-700 mx-auto" />
                            <p className="text-xs text-zinc-500 italic">Type at least 2 characters to search across files and code.</p>
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center space-y-2">
                            <X className="w-8 h-8 text-red-400 mx-auto" />
                            <p className="text-xs text-red-300">{error}</p>
                        </div>
                    ) : results.length === 0 && !loading ? (
                        <div className="p-8 text-center space-y-2">
                            <FileCode className="w-8 h-8 text-zinc-700 mx-auto" />
                            <p className="text-xs text-zinc-500">No results found for &quot;{query}&quot;</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {results.map((result) => (
                                <button
                                    key={result.id}
                                    onClick={() => handleSelect(result.id)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left group"
                                >
                                    <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                                        <FileCodeIcon language={result.language} className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">{result.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-zinc-500 uppercase font-black">{result.language}</span>
                                            <span className="text-[10px] text-zinc-700">•</span>
                                            <span className="text-[10px] text-zinc-500">Updated {new Date(result.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    {result.documentation?.status && (
                                        <div className={cn(
                                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter",
                                            result.documentation.status === "APPROVED" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                                        )}>
                                            {result.documentation.status}
                                        </div>
                                    )}
                                    <CornerDownLeft className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10 text-[9px] font-bold text-zinc-400">↑↓</kbd>
                            <span className="text-[10px] text-zinc-500">Navigate</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10 text-[9px] font-bold text-zinc-400">Enter</kbd>
                            <span className="text-[10px] text-zinc-500">Select</span>
                        </div>
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">
                        DocuMint Index v2.0
                    </div>
                </div>
            </div>
        </div>
    );
}
