"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Loader2, Download, RefreshCcw } from "lucide-react";

interface DiagramViewerProps {
    code: string;
    type?: string;
}

export function DiagramViewer({ code, type = "class" }: DiagramViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "loose",
            fontFamily: "inherit",
        });
    }, []);

    useEffect(() => {
        const autoRepair = (input: string): string => {
            let fixed = input.trim();
            // Basic single-line detection and fix
            if (!fixed.includes('\n') || fixed.split('\n').length < 3) {
                if (fixed.toLowerCase().startsWith('erdiagram')) {
                    fixed = fixed
                        .replace(/^ERDiagram/i, "erDiagram")
                        .replace(/erDiagram\s*/i, "erDiagram\n")
                        .replace(/([a-zA-Z0-9_]+)\s*\{/g, "\n$1 {")
                        .replace(/\}\s*/g, "}\n")
                        .replace(/\s([a-zA-Z0-9_]+)\s+([\}|o\+\{\.\-]+[-.]{2,}[|o\+\{\.\-]+)/g, "\n$1 $2")
                        .replace(/\s([a-zA-Z0-9_]+)\s+([-.]+[|o\+\{\.\-]+)/g, "\n$1 $2");
                } else if (fixed.toLowerCase().startsWith('sequencediagram')) {
                    fixed = fixed
                        .replace(/^sequenceDiagram/i, "sequenceDiagram\n")
                        .replace(/participant /g, "\nparticipant ")
                        .replace(/(\w+)\s*->/g, "\n$1 ->")
                        .replace(/(\w+)\s*-->/g, "\n$1 -->")
                        .replace(/Note /g, "\nNote ");
                } else {
                    fixed = fixed
                        .replace(/classDiagram/i, "classDiagram\n")
                        .replace(/\} class/g, "}\nclass")
                        .replace(/\} ([A-Z])/g, "}\n$1")
                        .replace(/(\w+)\s*-->/g, "\n$1 -->")
                        .replace(/; /g, "\n");
                }
            }
            return fixed;
        };

        const renderDiagram = async () => {
            if (!code || !containerRef.current) return;

            try {
                setError(null);
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                const { svg } = await mermaid.render(id, code);
                setSvg(svg);
            } catch (err) {
                console.warn("First render failed, attempting client-side auto-repair...");
                try {
                    const repaired = autoRepair(code);
                    // If repair didn't change anything, don't bother retrying (unless forceFormat logic is generic)

                    const id = `mermaid-retry-${Math.random().toString(36).substr(2, 9)}`;
                    const { svg } = await mermaid.render(id, repaired);
                    setSvg(svg);
                } catch (retryErr) {
                    console.error("Mermaid final render error:", retryErr);
                    setError("Failed to render diagram. The AI output might be invalid syntax.");
                }
            }
        };

        renderDiagram();
    }, [code, type]);

    const handleDownload = () => {
        if (!svg) return;

        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `diagram-${type}-${new Date().toISOString().split("T")[0]}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (error) {
        return (
            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg text-red-400 text-sm">
                <p className="font-medium mb-2">Rendering Error</p>
                <p>{error}</p>
                <div className="mt-4 p-2 bg-black/30 rounded font-mono text-xs overflow-auto max-h-32">
                    {code}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-end">
                <button
                    onClick={handleDownload}
                    disabled={!svg}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-50"
                >
                    <Download className="w-3.5 h-3.5" />
                    Export SVG
                </button>
            </div>

            <div
                className="w-full overflow-auto bg-zinc-900/50 rounded-lg p-6 flex justify-center min-h-[300px]"
                ref={containerRef}
            >
                {svg ? (
                    <div dangerouslySetInnerHTML={{ __html: svg }} className="w-full" />
                ) : (
                    <div className="flex items-center justify-center text-zinc-500 h-full">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        Rendering...
                    </div>
                )}
            </div>
        </div>
    );
}
