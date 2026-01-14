"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, File as FileIcon, CornerDownLeft } from "lucide-react";
import { File } from "@prisma/client";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    files: File[];
    onSelectFile: (fileId: string) => void;
}

export function CommandPalette({ isOpen, onClose, files, onSelectFile }: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredFiles = useMemo(() => {
        if (!query) return files.slice(0, 10);
        return files.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
    }, [files, query]);

    // Reset selection when query changes
    useEffect(() => setSelectedIndex(0), [query]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (filteredFiles[selectedIndex]) {
                    onSelectFile(filteredFiles[selectedIndex].id);
                    onClose();
                }
            } else if (e.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, filteredFiles, selectedIndex, onSelectFile, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-xl bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center px-4 py-3 border-b border-white/5 gap-3">
                    <Search className="w-5 h-5 text-muted-foreground" />
                    <input
                        autoFocus
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search files..."
                        className="flex-1 bg-transparent text-lg text-white placeholder:text-muted-foreground focus:outline-none"
                    />
                    <div className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground">ESC</div>
                </div>

                <div className="max-h-[300px] overflow-y-auto py-2">
                    {filteredFiles.length === 0 ? (
                        <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No files found.
                        </div>
                    ) : (
                        filteredFiles.map((file, i) => (
                            <div
                                key={file.id}
                                onClick={() => {
                                    onSelectFile(file.id);
                                    onClose();
                                }}
                                className={cn(
                                    "px-4 py-2 flex items-center gap-3 cursor-pointer text-sm",
                                    i === selectedIndex ? "bg-primary/20 text-white" : "text-muted-foreground hover:bg-white/5"
                                )}
                            >
                                <FileIcon className="w-4 h-4" />
                                <span className="flex-1 truncate">{file.name}</span>
                                {i === selectedIndex && (
                                    <CornerDownLeft className="w-3.5 h-3.5 opacity-50" />
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="px-4 py-2 bg-white/5 border-t border-white/5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <div>
                        <span className="text-white">↑↓</span> to navigate
                    </div>
                    <div>
                        <span className="text-white">↵</span> to select
                    </div>
                </div>
            </div>
        </div>
    );
}
