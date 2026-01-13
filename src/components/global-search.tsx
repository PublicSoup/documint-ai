"use client";

import { useState, useEffect, useRef } from "react";
import { Search, FileText, Code, BookOpen, X, Command } from "lucide-react";
import { useRouter } from "next/navigation";

interface SearchResult {
    type: "file" | "code" | "doc";
    id: string;
    title: string;
    subtitle: string;
    snippet?: string;
    match: string;
}

export function GlobalSearch() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    // Keyboard shortcut: Cmd/Ctrl + K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Search on query change
    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (res.ok) {
                    setResults(data.results);
                    setSelectedIndex(0);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        setQuery("");
        router.push(`/dashboard?file=${result.id}`);
    };

    const handleKeyNav = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === "Enter" && results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case "file": return <FileText className="w-4 h-4 text-blue-500" />;
            case "code": return <Code className="w-4 h-4 text-green-500" />;
            case "doc": return <BookOpen className="w-4 h-4 text-purple-500" />;
            default: return <Search className="w-4 h-4" />;
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
                <Search className="w-4 h-4" />
                <span>Search...</span>
                <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-white border rounded">
                    <Command className="w-3 h-3" />K
                </kbd>
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
            />

            {/* Modal */}
            <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyNav}
                        placeholder="Search files, code, documentation..."
                        className="flex-1 text-lg outline-none"
                    />
                    <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Results */}
                <div className="max-h-[400px] overflow-y-auto">
                    {loading && (
                        <div className="p-4 text-center text-gray-500">
                            Searching...
                        </div>
                    )}

                    {!loading && query.length >= 2 && results.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            No results found for "{query}"
                        </div>
                    )}

                    {results.map((result, index) => (
                        <button
                            key={`${result.type}-${result.id}-${index}`}
                            onClick={() => handleSelect(result)}
                            className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${index === selectedIndex ? "bg-blue-50" : ""
                                }`}
                        >
                            <div className="mt-1">{getIcon(result.type)}</div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 truncate">
                                    {result.title}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {result.subtitle}
                                </div>
                                {result.snippet && (
                                    <pre className="mt-1 text-xs text-gray-600 bg-gray-100 p-2 rounded truncate">
                                        {result.snippet}
                                    </pre>
                                )}
                            </div>
                            <span className="text-xs text-gray-400 uppercase">
                                {result.match}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 bg-white border rounded">↑</kbd>
                            <kbd className="px-1 py-0.5 bg-white border rounded">↓</kbd>
                            navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1 py-0.5 bg-white border rounded">↵</kbd>
                            select
                        </span>
                    </div>
                    <span className="flex items-center gap-1">
                        <kbd className="px-1 py-0.5 bg-white border rounded">esc</kbd>
                        close
                    </span>
                </div>
            </div>
        </div>
    );
}
