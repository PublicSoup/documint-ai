"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Loader2, Download, RefreshCcw } from "lucide-react";

interface DiagramViewerProps {
    code: string;
    type?: string;
    onNodeClick?: (id: string) => void;
}

declare global {
    interface Window {
        mermaidNodeClick?: (id: string) => void;
    }
}

export function DiagramViewer({ code, type = "class", onNodeClick }: DiagramViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);

    useEffect(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            themeVariables: {
                darkMode: true,
                background: '#0c0c0e',
                primaryColor: '#3b82f6',
                primaryTextColor: '#e2e8f0',
                primaryBorderColor: '#6366f1',
                lineColor: '#6366f1',
                secondaryColor: '#10b981',
                tertiaryColor: '#1e1b4b',
                edgeLabelBackground: '#1e1b4b',
                nodeTextColor: '#e2e8f0',
                clusterBkg: '#1a1a2e',
                clusterBorder: '#334155',
                titleColor: '#e2e8f0',
            },
            securityLevel: "loose",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
            flowchart: {
                htmlLabels: true,
                curve: 'basis',
                padding: 16,
                nodeSpacing: 40,
                rankSpacing: 50,
            }
        });

        // Expose callback for Mermaid click directives.
        window.mermaidNodeClick = (id: string) => {
            if (onNodeClick) onNodeClick(id);
        };

        return () => {
            delete window.mermaidNodeClick;
        };
    }, [onNodeClick]);

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

            setIsRendering(true);
            try {
                setError(null);
                const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
                const { svg } = await mermaid.render(id, code);
                setSvg(svg);
            } catch {
                try {
                    const repaired = autoRepair(code);
                    const id = `mermaid-retry-${Math.random().toString(36).slice(2, 11)}`;
                    const { svg } = await mermaid.render(id, repaired);
                    setSvg(svg);
                } catch {
                    setError("Failed to render diagram. The AI output might be invalid syntax.");
                    setSvg("");
                }
            } finally {
                setIsRendering(false);
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

    const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startPan, setStartPan] = useState({ x: 0, y: 0 });

    const handleZoomIn = () => setTransform(prev => ({ ...prev, k: Math.min(prev.k * 1.2, 5) }));
    const handleZoomOut = () => setTransform(prev => ({ ...prev, k: Math.max(prev.k / 1.2, 0.2) }));
    const handleReset = () => setTransform({ k: 1, x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setStartPan({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setTransform(prev => ({ ...prev, x: e.clientX - startPan.x, y: e.clientY - startPan.y }));
    };

    const handleMouseUp = () => setIsDragging(false);



    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setTransform(prev => ({
                ...prev,
                k: Math.max(0.2, Math.min(5, prev.k * delta))
            }));
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, []);

    useEffect(() => {
        if (!onNodeClick || !svg) return;

        const container = containerRef.current;
        if (!container) return;

        const onSvgClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            const node = target?.closest("g.node");
            if (!node) return;

            const title = node.querySelector("title")?.textContent?.trim();
            const text = node.textContent?.trim();
            const nodeId = (title || text || node.id || "").trim();

            if (nodeId) {
                onNodeClick(nodeId);
            }
        };

        container.addEventListener("click", onSvgClick);
        return () => container.removeEventListener("click", onSvgClick);
    }, [onNodeClick, svg]);

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
            <div className="flex justify-between items-center">
                <div className="flex gap-2">
                    <button onClick={handleZoomIn} className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Zoom In">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                    </button>
                    <button onClick={handleZoomOut} className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Zoom Out">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                    </button>
                    <button onClick={handleReset} className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Reset View">
                        <RefreshCcw className="w-4 h-4" />
                    </button>
                </div>
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
                className="w-full overflow-hidden bg-zinc-900/50 rounded-lg h-[500px] relative cursor-grab active:cursor-grabbing border border-zinc-800"
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {svg ? (
                    <div
                        dangerouslySetInnerHTML={{ __html: svg }}
                        className="origin-top-left transition-transform duration-75 ease-out"
                        style={{
                            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`
                        }}
                    />
                ) : isRendering ? (
                    <div className="flex items-center justify-center text-zinc-500 h-full">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        Rendering...
                    </div>
                ) : (
                    <div className="flex items-center justify-center text-zinc-500 h-full text-sm">
                        No diagram available.
                    </div>
                )}
            </div>
        </div>
    );
}
