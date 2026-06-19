"use client";

import { cn } from "@/lib/utils";
import {
    ChevronRight,
    Share2,
    Keyboard,
    Box,
    Play,
    Hammer,
    FlaskConical
} from "lucide-react";

interface ContextualHeaderProps {
    filePath?: string;
    isSaving?: boolean;
    runtimeStatusLabel?: string;
    canRun?: boolean;
    canBuild?: boolean;
    canTest?: boolean;
    runDisabledReason?: string;
    buildDisabledReason?: string;
    testDisabledReason?: string;
    canShare?: boolean;
    onShare?: () => void;
    onKeyboardShortcuts?: () => void;
    onDeploy?: () => void;
    onBuild?: () => void;
    onTest?: () => void;
}

export function ContextualHeader({
    filePath = "Select a file",
    isSaving,
    runtimeStatusLabel,
    canRun = true,
    canBuild = true,
    canTest = true,
    runDisabledReason,
    buildDisabledReason,
    testDisabledReason,
    canShare = true,
    onShare,
    onKeyboardShortcuts,
    onDeploy,
    onBuild,
    onTest
}: ContextualHeaderProps) {
    const pathParts = filePath.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const folderPath = pathParts.slice(0, -1).join(' / ');

    return (
        <div className="h-11 flex-none border-b border-white/[0.04] bg-gradient-to-r from-[#030014]/90 via-[#08002a]/90 to-[#030014]/90 backdrop-blur-xl flex items-center justify-between px-4 z-40">
            <div className="flex items-center gap-4 overflow-hidden">
                {/* File Identity Breadcrumb */}
                <div className="flex items-center gap-2 text-white/35">
                    <Box className="w-3.5 h-3.5 text-purple-400/40" />
                    <div className="flex items-center text-[11px] font-medium tracking-tight whitespace-nowrap overflow-hidden">
                        <span>workspace</span>
                        <ChevronRight className="w-3 h-3 mx-0.5 opacity-30" />
                        {folderPath && (
                            <>
                                <span className="truncate max-w-[150px]">{folderPath}</span>
                                <ChevronRight className="w-3 h-3 mx-0.5 opacity-30" />
                            </>
                        )}
                        <span className="text-white/80 font-semibold">{fileName}</span>
                    </div>
                </div>
                {isSaving && (
                    <div className="flex items-center gap-1.5 text-[10px] text-purple-300/60">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        <span>Saving</span>
                    </div>
                )}
                {runtimeStatusLabel && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 animate-pulse">
                        <Play className="w-3 h-3" />
                        <span>{runtimeStatusLabel}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    onClick={onDeploy}
                    disabled={!canRun}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all active:scale-95 text-[11px] font-bold uppercase tracking-wider",
                        !canRun
                            ? "bg-emerald-500/10 text-emerald-500/50 cursor-not-allowed"
                            : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                    )}
                    title={canRun ? "Run Project" : runDisabledReason || "Runtime is busy"}
                >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run / Preview</span>
                </button>

                <button
                    type="button"
                    onClick={onBuild}
                    disabled={!canBuild}
                    className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-300/50 hover:text-blue-300 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                    title={canBuild ? "Build Project" : buildDisabledReason || "Build unavailable"}
                >
                    <Hammer className="w-3.5 h-3.5" />
                </button>

                <button
                    type="button"
                    onClick={onTest}
                    disabled={!canTest}
                    className="p-2 rounded-lg hover:bg-violet-500/10 text-violet-300/50 hover:text-violet-300 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                    title={canTest ? "Test Project" : testDisabledReason || "Test unavailable"}
                >
                    <FlaskConical className="w-3.5 h-3.5" />
                </button>

                <div className="w-px h-4 bg-white/[0.06] mx-1" />

                <button
                    type="button"
                    onClick={onShare}
                    disabled={!canShare}
                    className="p-2 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white/60 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                    title={canShare ? "Share" : "Select a file to share"}
                >
                    <Share2 className="w-3.5 h-3.5" />
                </button>

                <button
                    type="button"
                    onClick={onKeyboardShortcuts}
                    className="p-2 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white/60 transition-all active:scale-95"
                    title="Keyboard Shortcuts"
                >
                    <Keyboard className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}