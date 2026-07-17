"use client";

import { useState } from "react";
import { mutate } from "swr";
import { Loader2, Sparkles } from "lucide-react";

interface AutoDocumentButtonProps {
    /** Document a single file. Ignored when `all` is set. */
    fileId?: string;
    /** Document every undocumented file in the workspace/team. */
    all?: boolean;
    /** Regenerate even if documentation already exists. */
    force?: boolean;
    label?: string;
    onNotify?: (message: string, type?: "success" | "error" | "warning") => void;
    className?: string;
}

/**
 * Triggers auto-documentation via `POST /api/ide/auto-document` and refreshes the
 * IDE file tree so freshly-generated docs appear immediately.
 */
export function AutoDocumentButton({
    fileId,
    all,
    force,
    label,
    onNotify,
    className,
}: AutoDocumentButtonProps) {
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (busy) return;
        if (!all && !fileId) {
            onNotify?.("Select a file to document first", "warning");
            return;
        }

        setBusy(true);
        try {
            const res = await fetch("/api/ide/auto-document", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(all ? { all: true, force } : { fileId, force }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                onNotify?.(data?.error || "Auto-documentation failed", "error");
                return;
            }

            const documented: number = data.documented ?? 0;
            const failed: number = data.failed ?? 0;

            if (documented > 0) {
                onNotify?.(`Documented ${documented} file${documented === 1 ? "" : "s"}`, "success");
            } else if (failed > 0) {
                onNotify?.("Documentation service is unavailable right now — try again shortly", "error");
            } else {
                onNotify?.(all ? "Everything is already documented" : "This file is already documented", "success");
            }

            // Revalidate the file tree so documentation badges update.
            await mutate("/api/files");
        } catch {
            onNotify?.("Error running auto-documentation", "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={run}
            disabled={busy}
            className={
                className ??
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-200 hover:bg-purple-500/25 border border-purple-500/25 text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            }
        >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? "Documenting…" : label ?? "Auto-document"}
        </button>
    );
}
