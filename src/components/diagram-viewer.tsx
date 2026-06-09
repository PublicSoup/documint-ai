"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";
import { Loader2, Download, RefreshCcw, Maximize2, Minimize2, Move } from "lucide-react";

interface DiagramViewerProps {
    code: string;
    type?: string;
    onNodeClick?: (id: string) => void;
    /** Optional: called when render errors. Useful for the parent to surface a toast. */
    onError?: (error: string) => void;
    /** Optional: called once per render with the rendered SVG. */
    onRendered?: (svg: string) => void;
}

declare global {
    interface Window {
        mermaidNodeClick?: (id: string) => void;
    }
}

const MAX_DIAGRAM_CHARS = 100_000;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.2;

let mermaidInitPromise: Promise<void> | null = null;

/**
 * Initialize Mermaid exactly once for the lifetime of the page. Subsequent
 * re-renders reuse the same configuration. Without this, the initialize
 * call would re-run every time the `onNodeClick` prop identity changes.
 */
function ensureMermaidInitialized(): Promise<void> {
    if (mermaidInitPromise) return mermaidInitPromise;
    mermaidInitPromise = (async () => {
        mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            themeVariables: {
                darkMode: true,
                background: "#0c0c0e",
                primaryColor: "#3b82f6",
                primaryTextColor: "#e2e8f0",
                primaryBorderColor: "#6366f1",
                lineColor: "#6366f1",
                secondaryColor: "#10b981",
                tertiaryColor: "#1e1b4b",
                edgeLabelBackground: "#1e1b4b",
                nodeTextColor: "#e2e8f0",
                clusterBkg: "#1a1a2e",
                clusterBorder: "#334155",
                titleColor: "#e2e8f0",
            },
            securityLevel: "strict",
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
            flowchart: {
                htmlLabels: false,
                curve: "basis",
                padding: 16,
                nodeSpacing: 40,
                rankSpacing: 50,
            },
        });
    })();
    return mermaidInitPromise;
}

function sanitizeMermaidInput(input: string): string {
    return input
        .replace(/\u0000/g, "")
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .trim()
        .slice(0, MAX_DIAGRAM_CHARS);
}

function isSafeSvgUrl(rawValue: string): boolean {
    const value = rawValue.trim().toLowerCase();
    if (!value) return true;
    if (value.startsWith("#") || value.startsWith("/")) return true;
    if (value.startsWith("data:")) return false; // block data: URIs as a hardening measure
    return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:") || value.startsWith("tel:");
}

function sanitizeSvg(svg: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");

    const forbiddenTags = ["script", "foreignObject", "iframe", "object", "embed", "link"];
    for (const tag of forbiddenTags) {
        doc.querySelectorAll(tag).forEach((node) => node.remove());
    }

    doc.querySelectorAll("*").forEach((element) => {
        const attrs = [...element.attributes];
        for (const attr of attrs) {
            const name = attr.name.toLowerCase();
            const value = attr.value;

            if (name.startsWith("on")) {
                element.removeAttribute(attr.name);
                continue;
            }

            if (name === "href" || name === "xlink:href") {
                if (!isSafeSvgUrl(value)) {
                    element.removeAttribute(attr.name);
                }
            }
        }
    });

    return new XMLSerializer().serializeToString(doc);
}

function decodeMermaidIdArg(raw: string): string {
    return raw.replace(/#quot;/g, '"');
}

export function DiagramViewer({ code, type = "class", onNodeClick, onError, onRendered }: DiagramViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const renderIdRef = useRef(0);
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startPan, setStartPan] = useState({ x: 0, y: 0 });

    // Hook up the global click callback exactly once. We re-read `onNodeClick`
    // from a ref so the function identity doesn't force a re-init.
    const onNodeClickRef = useRef(onNodeClick);
    useEffect(() => {
        onNodeClickRef.current = onNodeClick;
    }, [onNodeClick]);

    useEffect(() => {
        ensureMermaidInitialized();
        window.mermaidNodeClick = (id: string) => {
            onNodeClickRef.current?.(decodeMermaidIdArg(id));
        };
        return () => {
            delete window.mermaidNodeClick;
        };
    }, []);

    // Render the diagram whenever the source code changes.
    useEffect(() => {
        const currentRenderId = ++renderIdRef.current;
        const renderDiagram = async () => {
            if (!code || !containerRef.current) return;

            setIsRendering(true);
            setError(null);

            try {
                await ensureMermaidInitialized();
                const safeInput = sanitizeMermaidInput(code);
                const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
                const rendered = await mermaid.render(id, safeInput);

                // If another render has started in the meantime, drop this one.
                if (currentRenderId !== renderIdRef.current) return;

                const sanitized = sanitizeSvg(rendered.svg);
                setSvg(sanitized);
                setTransform({ k: 1, x: 0, y: 0 });
                onRendered?.(sanitized);
            } catch (e) {
                if (currentRenderId !== renderIdRef.current) return;
                const message = e instanceof Error ? e.message : "Failed to render diagram";
                setError(`Failed to render diagram: ${message}`);
                setSvg("");
                onError?.(message);
            } finally {
                if (currentRenderId === renderIdRef.current) {
                    setIsRendering(false);
                }
            }
        };

        renderDiagram();
    }, [code, onError, onRendered]);

    const handleDownload = useCallback(() => {
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
    }, [svg, type]);

    const handleZoomIn = useCallback(
        () => setTransform((prev) => ({ ...prev, k: Math.min(prev.k * ZOOM_STEP, ZOOM_MAX) })),
        [],
    );
    const handleZoomOut = useCallback(
        () => setTransform((prev) => ({ ...prev, k: Math.max(prev.k / ZOOM_STEP, ZOOM_MIN) })),
        [],
    );
    const handleReset = useCallback(() => setTransform({ k: 1, x: 0, y: 0 }), []);

    const handleFitToView = useCallback(() => {
        const container = containerRef.current;
        const inner = innerRef.current;
        if (!container || !inner) return;

        const svgEl = inner.querySelector("svg") as SVGElement | null;
        if (!svgEl) return;

        const containerRect = container.getBoundingClientRect();
        const svgRect = svgEl.getBoundingClientRect();
        if (svgRect.width === 0 || svgRect.height === 0) return;

        const scaleX = (containerRect.width - 32) / svgRect.width;
        const scaleY = (containerRect.height - 32) / svgRect.height;
        const scale = Math.min(scaleX, scaleY, 1); // never upscale beyond 1
        setTransform({ k: scale, x: 0, y: 0 });
    }, []);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            setIsDragging(true);
            setStartPan({ x: e.clientX - transform.x, y: e.clientY - transform.y });
        },
        [transform.x, transform.y],
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDragging) return;
            setTransform((prev) => ({ ...prev, x: e.clientX - startPan.x, y: e.clientY - startPan.y }));
        },
        [isDragging, startPan.x, startPan.y],
    );

    const handleMouseUp = useCallback(() => setIsDragging(false), []);

    // Mouse-wheel zoom (passive: false so we can preventDefault).
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
            setTransform((prev) => ({
                ...prev,
                k: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.k * delta)),
            }));
        };
        container.addEventListener("wheel", onWheel, { passive: false });
        return () => container.removeEventListener("wheel", onWheel);
    }, []);

    // Click-to-navigate handler attached at the container level so it works
    // across pan/zoom transforms. We look up the closest `g.node` and try
    // several label sources to recover the file id.
    useEffect(() => {
        if (!onNodeClick || !svg) return;
        const container = containerRef.current;
        if (!container) return;

        const onSvgClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            const node = target?.closest("g.node");
            if (!node) return;

            // Mermaid emits the node id as the `id` attribute on the wrapping
            // `<g>`, *and* as a `<title>` element inside it. Try the id first
            // (which is the safeNodeId we generated server-side), then the
            // title, then the text content as a last resort.
            const idAttr = node.getAttribute("id") ?? "";
            const title = node.querySelector("title")?.textContent?.trim();
            const text = node.textContent?.trim();
            const rawId = (idAttr || title || text || "").trim();

            if (!rawId) return;

            // The id attribute is a sanitized id like `nABCD_xxx`. We can't
            // reverse that without a server-side id map, so for click-handler
            // purposes we forward the title (the file path) when present.
            // The mermaid click handler we register on each node provides the
            // raw path via `window.mermaidNodeClick`, so this is only a
            // fallback.
            if (title) {
                onNodeClick(title);
            }
        };

        container.addEventListener("click", onSvgClick);
        return () => container.removeEventListener("click", onSvgClick);
    }, [onNodeClick, svg]);

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        setIsFullscreen((v) => !v);
    }, []);

    const containerClasses = useMemo(
        () =>
            [
                "w-full overflow-hidden bg-zinc-900/50 rounded-lg relative",
                isFullscreen ? "fixed inset-4 z-[9999] h-[calc(100vh-2rem)] shadow-2xl" : "h-[500px]",
                isDragging ? "cursor-grabbing" : "cursor-grab",
                "border border-zinc-800",
            ].join(" "),
        [isFullscreen, isDragging],
    );

    if (error) {
        return (
            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg text-red-400 text-sm">
                <p className="font-medium mb-2">Rendering Error</p>
                <p>{error}</p>
                <div className="mt-4 p-2 bg-black/30 rounded font-mono text-xs overflow-auto max-h-32 whitespace-pre">
                    {code.slice(0, 1000)}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <div className="flex gap-2">
                    <button
                        onClick={handleZoomIn}
                        aria-label="Zoom in"
                        className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                    </button>
                    <button
                        onClick={handleZoomOut}
                        aria-label="Zoom out"
                        className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
                    </button>
                    <button
                        onClick={handleReset}
                        aria-label="Reset view"
                        title="Reset view"
                        className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                    >
                        <RefreshCcw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleFitToView}
                        aria-label="Fit to view"
                        title="Fit to view"
                        className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                    >
                        <Move className="w-4 h-4" />
                    </button>
                    <button
                        onClick={toggleFullscreen}
                        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                        className="p-1.5 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
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
                className={containerClasses}
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                data-testid="diagram-canvas"
            >
                {svg ? (
                    <div
                        ref={innerRef}
                        dangerouslySetInnerHTML={{ __html: svg }}
                        className="origin-top-left"
                        style={{
                            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                            transformOrigin: "0 0",
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