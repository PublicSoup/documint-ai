"use client";

import React from "react";
import { ChevronRight, FileCode2 } from "lucide-react";

interface BreadcrumbsProps {
    filePath: string;
    onNavigate?: (path: string) => void;
}

/**
 * VS Code-style breadcrumbs navigation bar.
 * Shows the file path with clickable segments.
 * e.g.: src > components > ide > ai-chat-panel.tsx
 */
export function Breadcrumbs({ filePath, onNavigate }: BreadcrumbsProps) {
    if (!filePath) return null;

    const segments = filePath.split("/").filter(Boolean);
    const fileName = segments.pop() || filePath;

    // Detect the file icon based on extension
    const ext = fileName.split(".").pop()?.toLowerCase();
    const iconColor = getExtensionColor(ext);

    return (
        <div className="flex items-center gap-0.5 h-6 px-3 bg-[#030014]/80 border-b border-white/[0.04] select-none overflow-x-auto scrollbar-hide">
            {/* Folder segments */}
            {segments.map((segment, index) => {
                const partialPath = segments.slice(0, index + 1).join("/");
                return (
                    <React.Fragment key={index}>
                        <button
                            className="text-[11px] text-white/30 hover:text-white/60 transition-colors px-1 py-0.5 rounded hover:bg-white/[0.04] whitespace-nowrap"
                            onClick={() => onNavigate?.(partialPath)}
                            title={partialPath}
                        >
                            {segment}
                        </button>
                        <ChevronRight className="w-3 h-3 text-white/15 shrink-0" />
                    </React.Fragment>
                );
            })}

            {/* File name (active) */}
            <div className="flex items-center gap-1.5 px-1">
                <FileCode2 className="w-3 h-3 shrink-0" style={{ color: iconColor }} />
                <span className="text-[11px] text-white/70 font-medium whitespace-nowrap">{fileName}</span>
            </div>
        </div>
    );
}

function getExtensionColor(ext?: string): string {
    switch (ext) {
        case "tsx":
        case "jsx":
            return "#61DAFB"; // React blue
        case "ts":
            return "#3178C6"; // TypeScript blue
        case "js":
            return "#F7DF1E"; // JavaScript yellow
        case "css":
        case "scss":
            return "#1572B6"; // CSS blue
        case "html":
            return "#E34F26"; // HTML orange
        case "json":
            return "#F5A623"; // JSON amber
        case "md":
            return "#083FA1"; // Markdown blue
        case "py":
            return "#3776AB"; // Python blue
        case "prisma":
            return "#2D3748"; // Prisma dark
        default:
            return "rgba(255,255,255,0.3)";
    }
}
