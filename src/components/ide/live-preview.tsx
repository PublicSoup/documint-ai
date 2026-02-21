"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, ExternalLink, RefreshCw, X, Smartphone, Monitor, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";

interface LivePreviewProps {
    url?: string;
    isLoading?: boolean;
    onClose?: () => void;
    onRun?: () => void;
}

type ViewportSize = "desktop" | "tablet" | "mobile";

const VIEWPORT_SIZES: Record<ViewportSize, { width: string; label: string; icon: React.ReactNode }> = {
    desktop: { width: "100%", label: "Desktop", icon: <Monitor className="w-3.5 h-3.5" /> },
    tablet: { width: "768px", label: "Tablet", icon: <Tablet className="w-3.5 h-3.5" /> },
    mobile: { width: "375px", label: "Mobile", icon: <Smartphone className="w-3.5 h-3.5" /> },
};

export function LivePreview({ url, isLoading = false, onClose, onRun }: LivePreviewProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [viewport, setViewport] = useState<ViewportSize>("desktop");
    const [iframeKey, setIframeKey] = useState(0);

    const handleRefresh = () => {
        setIframeKey(prev => prev + 1);
    };

    const handleOpenExternal = () => {
        if (url) window.open(url, "_blank");
    };

    return (
        <div className="flex flex-col h-full bg-[#020010] border-l border-white/[0.06]">
            {/* Toolbar */}
            <div className="flex items-center justify-between h-9 px-2 bg-[#030014]/80 border-b border-white/[0.04] shrink-0">
                <div className="flex items-center gap-1">
                    <span className="text-[11px] text-white/50 font-medium px-2">Preview</span>

                    {/* Viewport switcher */}
                    <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-md p-0.5">
                        {(Object.entries(VIEWPORT_SIZES) as [ViewportSize, typeof VIEWPORT_SIZES[ViewportSize]][]).map(([key, { icon, label }]) => (
                            <button
                                key={key}
                                onClick={() => setViewport(key)}
                                title={label}
                                className={cn(
                                    "p-1 rounded transition-colors",
                                    viewport === key
                                        ? "bg-primary/20 text-primary"
                                        : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
                                )}
                            >
                                {icon}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={handleRefresh}
                        className="p-1 text-white/30 hover:text-white/60 transition-colors rounded hover:bg-white/[0.04]"
                        title="Refresh"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleOpenExternal}
                        className="p-1 text-white/30 hover:text-white/60 transition-colors rounded hover:bg-white/[0.04]"
                        title="Open in new tab"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 text-white/30 hover:text-white/60 transition-colors rounded hover:bg-white/[0.04]"
                            title="Close preview"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* URL bar */}
            {url && (
                <div className="flex items-center h-7 px-2 bg-[#030014]/50 border-b border-white/[0.04] shrink-0">
                    <div className="flex-1 flex items-center gap-2 bg-white/[0.03] rounded px-2 py-0.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-[10px] text-white/40 font-mono truncate">{url}</span>
                    </div>
                </div>
            )}

            {/* Preview area */}
            <div className="flex-1 flex items-center justify-center bg-[#0a0a0f] overflow-hidden">
                {isLoading || !url ? (
                    <div className="flex flex-col items-center gap-4 text-muted-foreground">
                        {isLoading ? (
                            <>
                                <Loader2 className="w-8 h-8 animate-spin text-purple-400/50" />
                                <div className="text-center">
                                    <p className="text-sm text-white/40">Starting dev server...</p>
                                    <p className="text-[10px] text-white/20 mt-1">Installing dependencies & booting</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/10">
                                    <Monitor className="w-7 h-7 text-emerald-400/30" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm text-white/30">Run your code to see it live</p>
                                    <p className="text-[10px] text-white/15 mt-1">npm install → npm run dev → preview here</p>
                                </div>
                                {onRun && (
                                    <button
                                        onClick={onRun}
                                        className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:from-emerald-500 hover:to-green-500 transition-all active:scale-95"
                                    >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                        Run Project
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div
                        className="h-full transition-all duration-300 bg-white"
                        style={{ width: VIEWPORT_SIZES[viewport].width, maxWidth: "100%" }}
                    >
                        <iframe
                            ref={iframeRef}
                            key={iframeKey}
                            src={url}
                            className="w-full h-full border-0"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                            title="Live Preview"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
