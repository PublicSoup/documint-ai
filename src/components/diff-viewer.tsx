"use client";

import { useMemo } from "react";
import * as diff from "diff";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
    oldValue: string;
    newValue: string;
    filename?: string;
}

export function DiffViewer({ oldValue, newValue, filename }: DiffViewerProps) {
    const diffs = useMemo(() => {
        return diff.diffLines(oldValue, newValue);
    }, [oldValue, newValue]);

    return (
        <div className="rounded-xl border border-white/10 bg-[#0A0A0B] overflow-hidden flex flex-col font-mono text-[11px]">
            {filename && (
                <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-zinc-500 flex items-center justify-between">
                    <span>{filename}</span>
                    <div className="flex gap-3">
                        <span className="text-emerald-500/80">+ Additions</span>
                        <span className="text-rose-500/80">- Deletions</span>
                    </div>
                </div>
            )}
            <div className="overflow-x-auto p-2">
                <table className="w-full border-collapse">
                    <tbody>
                        {diffs.map((part, index) => {
                            const colorClass = part.added 
                                ? "bg-emerald-500/10 text-emerald-400" 
                                : part.removed 
                                    ? "bg-rose-500/10 text-rose-400 line-through decoration-rose-500/30" 
                                    : "text-zinc-400";
                            
                            const prefix = part.added ? "+" : part.removed ? "-" : " ";
                            
                            return (
                                <tr key={index} className={cn("group", colorClass)}>
                                    <td className="w-6 text-center select-none opacity-30 border-r border-white/5 pr-2">
                                        {prefix}
                                    </td>
                                    <td className="pl-3 py-0.5 whitespace-pre-wrap break-all leading-relaxed">
                                        {part.value}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
