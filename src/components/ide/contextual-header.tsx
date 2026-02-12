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
    riskScore?: number;
    isSaving?: boolean;
    onShare?: () => void;
    onSettings?: () => void;
}

export function ContextualHeader({
    filePath = "Select a file",
    riskScore = 0,
    isSaving,
    onShare,
    onSettings
}: ContextualHeaderProps) {
    const pathParts = filePath.split('/');
    const fileName = pathParts.pop();
    const folderPath = pathParts.join(' / ');

    return (
        <div className="h-12 flex-none border-b border-white/5 bg-[#1a1a1c]/80 backdrop-blur-md flex items-center justify-between px-4 z-40">
            <div className="flex items-center gap-4 overflow-hidden">
                {/* File Identity */}
                <div className="flex items-center gap-2 text-white/40">
                    <Box className="w-4 h-4" />
                    <div className="flex items-center text-[11px] font-medium tracking-tight whitespace-nowrap overflow-hidden">
                        <span className="hover:text-white/60 cursor-pointer transition-colors">workspace</span>
                        <ChevronRight className="w-3 h-3 mx-0.5 opacity-50" />
                        {folderPath && (
                            <>
                                <span className="hover:text-white/60 cursor-pointer transition-colors truncate max-w-[150px]">{folderPath}</span>
                                <ChevronRight className="w-3 h-3 mx-0.5 opacity-50" />
                            </>
                        )}
                        <span className="text-white font-bold">{fileName}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={onShare}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-all active:scale-95"
                    title="Share"
                >
                    <Share2 className="w-4 h-4" />
                </button>

                <button
                    onClick={onSettings}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-all active:scale-95"
                    title="IDE Configuration"
                >
                    <Settings2 className="w-4 h-4" />
                </button>
            </div>

            <style jsx global>{`
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 3s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
}