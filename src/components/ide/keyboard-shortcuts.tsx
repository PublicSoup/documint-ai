"use client";

import React from "react";
import { X, Keyboard } from "lucide-react";

interface KeyboardShortcutsProps {
    isOpen: boolean;
    onClose: () => void;
}

const SHORTCUT_GROUPS = [
    {
        title: "General",
        shortcuts: [
            { keys: ["Ctrl/⌘", "K"], label: "Command Palette" },
            { keys: ["Ctrl/⌘", "S"], label: "Save File" },
            { keys: ["Ctrl/⌘", "Enter"], label: "Run / Preview Project" },
        ],
    },
    {
        title: "View",
        shortcuts: [
            { keys: ["Ctrl/⌘", "B"], label: "Toggle Sidebar" },
            { keys: ["Ctrl/⌘", "I"], label: "Toggle AI Chat" },
            { keys: ["Ctrl/⌘", "`"], label: "Toggle Terminal" },
        ],
    },
];

export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-2xl bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Keyboard className="w-4 h-4 text-primary" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.05] rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Shortcuts grid */}
                <div className="p-6 max-h-[60vh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {SHORTCUT_GROUPS.map(group => (
                        <div key={group.title}>
                            <h3 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">{group.title}</h3>
                            <div className="space-y-2">
                                {group.shortcuts.map(shortcut => (
                                    <div key={shortcut.label} className="flex items-center justify-between gap-3">
                                        <span className="text-sm text-white/60 truncate">{shortcut.label}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {shortcut.keys.map((key, i) => (
                                                <React.Fragment key={i}>
                                                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white/[0.06] border border-white/[0.08] rounded text-white/50 min-w-[20px] text-center">
                                                        {key}
                                                    </kbd>
                                                    {i < shortcut.keys.length - 1 && <span className="text-white/15 text-[10px]">+</span>}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-white/[0.06] bg-white/[0.02]">
                    <p className="text-[10px] text-white/20 text-center">
                        Only shortcuts wired by DocuMint are listed here. Monaco editor defaults may also work while the editor is focused.
                    </p>
                </div>
            </div>
        </div>
    );
}
