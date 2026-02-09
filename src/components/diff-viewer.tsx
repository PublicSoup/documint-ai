"use client";

import { useState, useEffect } from "react";
import { Plus, Minus, RefreshCw } from "lucide-react";

interface DiffChange {
    type: "added" | "removed" | "unchanged";
    value: string;
    lines: string[];
}

interface DiffViewerProps {
    fileId: string;
    versionId1?: string;
    versionId2?: string;
}

export function DiffViewer({ fileId, versionId1, versionId2 }: DiffViewerProps) {
    const [diff, setDiff] = useState<{ changes: DiffChange[]; stats: { additions: number; deletions: number } } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!versionId1 || !versionId2) return;

        async function loadDiff() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/versions/diff?v1=${versionId1}&v2=${versionId2}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                setDiff(data);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load diff");
            } finally {
                setLoading(false);
            }
        }

        loadDiff();
    }, [versionId1, versionId2]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8 text-gray-500">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                Loading diff...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-red-500 bg-red-50 rounded-lg">
                {error}
            </div>
        );
    }

    if (!diff) {
        return (
            <div className="p-8 text-center text-gray-500">
                Select two versions to compare
            </div>
        );
    }

    return (
        <div className="rounded-lg border overflow-hidden">
            {/* Stats header */}
            <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b text-sm">
                <span className="flex items-center gap-1 text-green-600">
                    <Plus className="w-4 h-4" />
                    {diff.stats.additions} additions
                </span>
                <span className="flex items-center gap-1 text-red-600">
                    <Minus className="w-4 h-4" />
                    {diff.stats.deletions} deletions
                </span>
            </div>

            {/* Diff content */}
            <div className="font-mono text-sm overflow-x-auto">
                {diff.changes.map((change, i) => (
                    <div key={i} className={`px-4 py-1 ${change.type === "added" ? "bg-green-50 text-green-800" :
                            change.type === "removed" ? "bg-red-50 text-red-800" :
                                "bg-white text-gray-700"
                        }`}>
                        {change.lines.map((line, j) => (
                            <div key={j} className="flex">
                                <span className="w-6 text-gray-400 select-none">
                                    {change.type === "added" ? "+" :
                                        change.type === "removed" ? "-" : " "}
                                </span>
                                <span className="flex-1 whitespace-pre-wrap">{line || " "}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
