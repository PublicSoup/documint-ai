"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

interface Props {
    analyzedCount: number;
    totalFilesCount: number;
}

interface BackfillResponse {
    analyzed: number;
    skipped: number;
    processed: number;
    remaining: number;
    done: boolean;
    error?: string;
    message?: string;
}

const MAX_ROUNDS = 100; // safety cap: 100 × 200 files = 20k files

/**
 * Runs the deterministic analyzer over the whole workspace by calling
 * /api/insights/backfill in a loop until every file has a FileInsight, then
 * refreshes the dashboard so the numbers update. No AI involved.
 */
export function AnalyzeWorkspaceButton({ analyzedCount, totalFilesCount }: Props) {
    const { toast } = useToast();
    const router = useRouter();
    const [running, setRunning] = useState(false);
    const [remaining, setRemaining] = useState<number | null>(null);

    const pending = Math.max(0, totalFilesCount - analyzedCount);
    const fullyAnalyzed = totalFilesCount > 0 && pending === 0;

    const run = async () => {
        if (running) return;
        setRunning(true);
        let totalAnalyzed = 0;

        try {
            for (let round = 0; round < MAX_ROUNDS; round++) {
                const res = await fetch("/api/insights/backfill", { method: "POST" });
                const data = (await res.json().catch(() => ({}))) as BackfillResponse;

                if (!res.ok) {
                    toast(data.message || data.error || "Analysis failed", "error");
                    break;
                }

                totalAnalyzed += data.analyzed ?? 0;
                setRemaining(data.remaining ?? 0);

                if (data.done || data.processed === 0) {
                    toast(
                        totalAnalyzed > 0
                            ? `Analyzed ${totalAnalyzed} file${totalAnalyzed === 1 ? "" : "s"}. Dashboard updated.`
                            : "Workspace already up to date.",
                        "success",
                    );
                    break;
                }
            }
            router.refresh();
        } catch {
            toast("Error analyzing workspace", "error");
        } finally {
            setRunning(false);
            setRemaining(null);
        }
    };

    if (running) {
        return (
            <Button variant="outline" size="sm" disabled className="gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing{remaining !== null ? ` — ${remaining} left` : "…"}
            </Button>
        );
    }

    if (fullyAnalyzed) {
        return (
            <Button variant="ghost" size="sm" className="gap-2" onClick={run} title="Re-analyze the whole workspace">
                <RefreshCw className="w-4 h-4" />
                Re-analyze
            </Button>
        );
    }

    return (
        <Button variant="primary" size="sm" className="gap-2" onClick={run}>
            <Sparkles className="w-4 h-4" />
            Analyze workspace{pending > 0 ? ` (${pending})` : ""}
        </Button>
    );
}
