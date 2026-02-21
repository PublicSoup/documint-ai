"use client";

import React from "react";
import {
    ChevronRight,
    Share2,
    Settings2,
    Box
} from "lucide-react";

interface ContextualHeaderProps {
    filePath?: string;
    isSaving?: boolean;
    onShare?: () => void;
    onSettings?: () => void;
}

export function ContextualHeader({
    filePath = "Select a file",
    isSaving,
    onShare,
    onSettings
}: ContextualHeaderProps) {
    const pathParts = filePath.split('/');
    const fileName = pathParts.pop();
    const folderPath = pathParts.join(' / ');

    return (
        <div className="h-11 flex-none border-b border-white/[0.04] bg-gradient-to-r from-[#030014]/90 via-[#08002a]/90 to-[#030014]/90 backdrop-blur-xl flex items-center justify-between px-4 z-40">
            <div className="flex items-center gap-4 overflow-hidden">
                {/* File Identity Breadcrumb */}
                <div className="flex items-center gap-2 text-white/35">
                    <Box className="w-3.5 h-3.5 text-purple-400/40" />
                    <div className="flex items-center text-[11px] font-medium tracking-tight whitespace-nowrap overflow-hidden">
                        <span className="hover:text-white/50 cursor-pointer transition-colors">workspace</span>
                        <ChevronRight className="w-3 h-3 mx-0.5 opacity-30" />
                        {folderPath && (
                            <>
                                <span className="hover:text-white/50 cursor-pointer transition-colors truncate max-w-[150px]">{folderPath}</span>
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
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={onShare}
                    className="p-2 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white/60 transition-all active:scale-95"
                    title="Share"
                >
                    <Share2 className="w-3.5 h-3.5" />
                </button>

                <button
                    onClick={onSettings}
                    className="p-2 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white/60 transition-all active:scale-95"
                    title="IDE Configuration"
                >
                    <Settings2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}