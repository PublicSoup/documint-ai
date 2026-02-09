"use client";

import { useState, useEffect } from "react";
import {
    Lightbulb, AlertCircle, CheckCircle, Info,
    RefreshCw, Loader2, Crown, ChevronDown, ChevronUp
} from "lucide-react";

interface Suggestion {
    type: "missing" | "improvement" | "example" | "clarity";
    severity: "low" | "medium" | "high";
    entity?: string;
    message: string;
    suggestion: string;
}

interface DocSuggestionsProps {
    fileId: string;
}

const SEVERITY_STYLES = {
    high: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500" },
    medium: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500" },
    low: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-500" },
};

const TYPE_LABELS: Record<string, string> = {
    missing: "Missing",
    improvement: "Improve",
    example: "Example",
    clarity: "Clarity",
};

export default function DocSuggestions({ fileId }: DocSuggestionsProps) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [score, setScore] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    const fetchSuggestions = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/docs/suggest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId })
            });
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data.suggestions || []);
                setScore(data.score);
                setHasLoaded(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!hasLoaded) {
            fetchSuggestions();
        }
    }, [fileId]);

    if (!hasLoaded && !loading) {
        return null;
    }

    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Lightbulb className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            Smart Suggestions
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                                <Crown className="w-3 h-3" /> Pro
                            </span>
                        </h3>
                        <p className="text-sm text-gray-500">
                            AI-powered documentation improvements
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {score !== null && (
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${score >= 80 ? "bg-green-100 text-green-700" :
                                score >= 50 ? "bg-amber-100 text-amber-700" :
                                    "bg-red-100 text-red-700"
                            }`}>
                            Score: {score}%
                        </div>
                    )}
                    <button
                        onClick={fetchSuggestions}
                        disabled={loading}
                        className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                        ) : (
                            <RefreshCw className="w-4 h-4 text-gray-500" />
                        )}
                    </button>
                </div>
            </div>

            {/* Suggestions List */}
            <div className="divide-y">
                {loading && suggestions.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Analyzing documentation...
                    </div>
                ) : suggestions.length === 0 ? (
                    <div className="p-8 text-center">
                        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                        <p className="text-green-700 font-medium">Documentation looks great!</p>
                        <p className="text-sm text-gray-500 mt-1">No suggestions at this time</p>
                    </div>
                ) : (
                    suggestions.map((suggestion, i) => {
                        const styles = SEVERITY_STYLES[suggestion.severity];
                        const isExpanded = expanded === i;

                        return (
                            <div
                                key={i}
                                className={`${styles.bg} ${isExpanded ? "" : "hover:bg-opacity-70"} transition-colors`}
                            >
                                <button
                                    onClick={() => setExpanded(isExpanded ? null : i)}
                                    className="w-full p-4 text-left flex items-start gap-3"
                                >
                                    <div className={`mt-0.5 ${styles.icon}`}>
                                        {suggestion.severity === "high" ? (
                                            <AlertCircle className="w-5 h-5" />
                                        ) : suggestion.severity === "medium" ? (
                                            <Info className="w-5 h-5" />
                                        ) : (
                                            <Lightbulb className="w-5 h-5" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 text-xs rounded ${styles.border} border bg-white/50`}>
                                                {TYPE_LABELS[suggestion.type]}
                                            </span>
                                            {suggestion.entity && (
                                                <code className="text-xs text-gray-600 bg-white/50 px-1.5 py-0.5 rounded">
                                                    {suggestion.entity}
                                                </code>
                                            )}
                                        </div>
                                        <p className="font-medium text-gray-900 mt-1">
                                            {suggestion.message}
                                        </p>
                                        {isExpanded && (
                                            <p className="text-sm text-gray-600 mt-2 bg-white/50 p-3 rounded-lg border">
                                                💡 {suggestion.suggestion}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-gray-400">
                                        {isExpanded ? (
                                            <ChevronUp className="w-4 h-4" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4" />
                                        )}
                                    </div>
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
