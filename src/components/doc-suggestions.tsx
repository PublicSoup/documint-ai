"use client";

import { useState, useEffect } from "react";
import {
    Lightbulb, AlertCircle, CheckCircle, Info,
    RefreshCw, Loader2, Crown, ChevronDown, ChevronUp, Eye, Check, X, Sparkles
} from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "./toast";
import { DiffViewer } from "./diff-viewer";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface Suggestion {
    type: "missing" | "improvement" | "example" | "clarity" | "drift";
    severity: "low" | "medium" | "high";
    entity?: string;
    message: string;
    suggestion: string;
}

interface DocSuggestionsProps {
    fileId: string;
    onUpdate?: () => void;
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
    drift: "Drift",
};

export default function DocSuggestions({ fileId, onUpdate }: DocSuggestionsProps) {
    const { toast } = useToast();
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [score, setScore] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    // Drift preview state
    const [proposedUpdate, setProposedUpdate] = useState<{ current: string, next: string, raw: unknown } | null>(null);
    const [isApplying, setIsApplying] = useState(false);

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

    const formatDocForDiff = (doc: { summary?: string, entities?: Array<{ name: string, type: string, doc: string }> } | null) => {
        if (!doc) return "";
        let out = `SUMMARY:\n${doc.summary || ""}\n\nENTITIES:\n`;
        if (doc.entities) {
            doc.entities.forEach((e) => {
                out += `- ${e.name} (${e.type})\n  ${e.doc}\n\n`;
            });
        }
        return out;
    };

    const handleApplySuggestion = async (s: Suggestion) => {
        if (s.type === "drift") {
            setLoading(true);
            try {
                const res = await fetch(`/api/regenerate/${fileId}`, { 
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ preview: true })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setProposedUpdate({
                        current: formatDocForDiff(data.currentContent),
                        next: formatDocForDiff(data.content),
                        raw: data.content
                    });
                } else {
                    toast("Failed to generate preview", "error");
                }
            } catch (e) {
                toast("An error occurred during preview generation", "error");
            } finally {
                setLoading(false);
            }
        }
    };

    const commitUpdate = async () => {
        if (!proposedUpdate) return;
        setIsApplying(true);
        try {
            const res = await fetch(`/api/docs/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    content: proposedUpdate.raw,
                    message: "Resolved documentation drift via AI suggestions"
                }),
            });

            if (res.ok) {
                toast("Documentation updated and synced", "success");
                setProposedUpdate(null);
                fetchSuggestions();
                if (onUpdate) onUpdate();
            } else {
                toast("Failed to apply update", "error");
            }
        } catch (e) {
            toast("Error applying update", "error");
        } finally {
            setIsApplying(false);
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
                        <h3 className="font-bold text-zinc-100 flex items-center gap-2">
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
                                                <code className="text-xs text-zinc-400 bg-white/50 px-1.5 py-0.5 rounded">
                                                    {suggestion.entity}
                                                </code>
                                            )}
                                        </div>
                                        <p className="font-medium text-zinc-100 mt-1">
                                            {suggestion.message}
                                        </p>
                                        {isExpanded && (
                                            <div className="mt-2 space-y-3">
                                                <p className="text-sm text-zinc-400 bg-white/50 p-3 rounded-lg border">
                                                    💡 {suggestion.suggestion}
                                                </p>
                                                {suggestion.type === "drift" && (
                                                    <Button
                                                        size="sm"
                                                        onClick={(e: React.MouseEvent) => {
                                                            e.stopPropagation();
                                                            handleApplySuggestion(suggestion);
                                                        }}
                                                        className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-bold h-8 text-[10px]"
                                                    >
                                                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                                        Review Proposed Update
                                                    </Button>
                                                )}
                                            </div>
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

            {/* Preview Modal */}
            <Dialog open={!!proposedUpdate} onOpenChange={(open) => !open && setProposedUpdate(null)}>
                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col bg-[#0A0A0B] border-white/10 p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b border-white/10 shrink-0">
                        <DialogTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">Resolve Documentation Drift</h2>
                                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">AI-Drafted Update based on latest code</p>
                                </div>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black/40">
                        <DiffViewer 
                            oldValue={proposedUpdate?.current || ""} 
                            newValue={proposedUpdate?.next || ""} 
                            filename="Project Documentation"
                        />
                    </div>

                    <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end gap-3 shrink-0">
                        <Button variant="ghost" onClick={() => setProposedUpdate(null)} className="rounded-xl font-bold text-xs">
                            Discard
                        </Button>
                        <Button 
                            onClick={commitUpdate}
                            disabled={isApplying}
                            className="rounded-xl font-bold text-xs px-6 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 gap-2"
                        >
                            {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Apply & Sync
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
