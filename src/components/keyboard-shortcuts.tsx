"use client";

import React, { useState, useEffect } from "react";
import { Keyboard, Moon, Sun, Monitor, Check } from "lucide-react";

type Theme = "light" | "dark" | "system";

interface ShortcutKey {
    keys: string[];
    description: string;
}

const shortcuts: ShortcutKey[] = [
    { keys: ["⌘", "K"], description: "Open search" },
    { keys: ["⌘", "N"], description: "New file upload" },
    { keys: ["⌘", "S"], description: "Save changes" },
    { keys: ["⌘", "E"], description: "Export documentation" },
    { keys: ["Esc"], description: "Close modals" },
    { keys: ["?"], description: "Show shortcuts" },
];

export default function KeyboardShortcuts() {
    const [isOpen, setIsOpen] = useState(false);
    const [theme, setTheme] = useState<Theme>("system");

    const handleThemeChange = (newTheme: Theme) => {
        setTheme(newTheme);
        // In a real app, you'd apply the theme here
        if (newTheme === "dark") {
            document.documentElement.classList.add("dark");
        } else if (newTheme === "light") {
            document.documentElement.classList.remove("dark");
        } else {
            // System preference
            if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    };

    // Listen for ? key to toggle shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
                setIsOpen(prev => !prev);
            }
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 p-3 bg-white shadow-lg rounded-full hover:shadow-xl transition-shadow border"
                title="Keyboard shortcuts (?)"
            >
                <Keyboard className="w-5 h-5 text-gray-600" />
            </button>
        );
    }

    return (
        <>
            <div
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() => setIsOpen(false)}
            />
            <div className="fixed inset-x-0 bottom-0 md:inset-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 p-4">
                <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Keyboard className="w-5 h-5" />
                            Keyboard Shortcuts
                        </h3>
                    </div>

                    <div className="p-4 space-y-2">
                        {shortcuts.map((shortcut, i) => (
                            <div key={i} className="flex items-center justify-between py-2">
                                <span className="text-sm text-gray-600">{shortcut.description}</span>
                                <div className="flex gap-1">
                                    {shortcut.keys.map((key, j) => (
                                        <kbd
                                            key={j}
                                            className="px-2 py-1 text-xs font-mono bg-gray-100 border rounded"
                                        >
                                            {key}
                                        </kbd>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t bg-gray-50">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Theme</h4>
                        <div className="flex gap-2">
                            {[
                                { value: "light" as Theme, icon: Sun, label: "Light" },
                                { value: "dark" as Theme, icon: Moon, label: "Dark" },
                                { value: "system" as Theme, icon: Monitor, label: "System" },
                            ].map(({ value, icon: Icon, label }) => (
                                <button
                                    key={value}
                                    onClick={() => handleThemeChange(value)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors ${theme === value
                                        ? "bg-blue-50 border-blue-200 text-blue-600"
                                        : "hover:bg-gray-100"
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span className="text-sm">{label}</span>
                                    {theme === value && <Check className="w-3 h-3" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 border-t text-center">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-sm text-gray-500 hover:text-gray-700"
                        >
                            Press <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Esc</kbd> to close
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
