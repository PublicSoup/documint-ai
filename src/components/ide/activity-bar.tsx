"use client";

import Link from "next/link";
import { Files, GitBranch, Keyboard, LayoutDashboard, Search, Sparkles, Terminal as TerminalIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SidebarTab } from "./shared/types";

interface ActivityItem {
    tab: SidebarTab;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    shortcut?: string;
}

const activityItems: ActivityItem[] = [
    { tab: "explorer", icon: Files, label: "Explorer", shortcut: "⌘B" },
    { tab: "search", icon: Search, label: "Search" },
    { tab: "git", icon: GitBranch, label: "Source Control" },
];

interface IDEActivityBarProps {
    activeSidebarTab: SidebarTab;
    showSidebar: boolean;
    showTerminal: boolean;
    onActiveSidebarTabChange: (tab: SidebarTab) => void;
    onShowSidebarChange: (visible: boolean) => void;
    onShowTerminalChange: (visible: boolean) => void;
    onOpenKeyboardShortcuts: () => void;
}

export function IDEActivityBar({
    activeSidebarTab,
    showSidebar,
    showTerminal,
    onActiveSidebarTabChange,
    onShowSidebarChange,
    onShowTerminalChange,
    onOpenKeyboardShortcuts,
}: IDEActivityBarProps) {
    const activateTab = (tab: SidebarTab) => {
        if (activeSidebarTab === tab && showSidebar) {
            onShowSidebarChange(false);
            return;
        }

        onActiveSidebarTabChange(tab);
        onShowSidebarChange(true);
    };

    return (
        <aside className="w-12 flex-none flex flex-col items-center py-3 gap-1 border-r border-white/[0.06] bg-[#050316] z-40 h-full overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center mb-3 border border-white/[0.06]">
                <Sparkles className="w-4 h-4 text-purple-300/80" />
            </div>

            {activityItems.map(({ tab, icon: Icon, label, shortcut }) => {
                const isActive = showSidebar && activeSidebarTab === tab;

                return (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => activateTab(tab)}
                        className={cn(
                            "p-2 rounded-lg transition-colors relative group",
                            isActive
                                ? "bg-purple-500/15 text-purple-300"
                                : "text-white/35 hover:text-white/70 hover:bg-white/[0.06]",
                        )}
                        title={shortcut ? `${label} (${shortcut})` : label}
                    >
                        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-purple-300 rounded-r" />}
                        <Icon className="w-5 h-5" />
                    </button>
                );
            })}

            <div className="flex-1" />

            <div className="flex flex-col gap-1">
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onShowTerminalChange(!showTerminal);
                    }}
                    className={cn(
                        "p-2 rounded-lg transition-colors",
                        showTerminal
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "text-white/35 hover:text-white/70 hover:bg-white/[0.06]",
                    )}
                    title="Terminal (⌘`)"
                >
                    <TerminalIcon className="w-5 h-5" />
                </button>
                <button
                    type="button"
                    onClick={onOpenKeyboardShortcuts}
                    className="p-2 text-white/35 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-colors"
                    title="Keyboard Shortcuts"
                >
                    <Keyboard className="w-5 h-5" />
                </button>
            </div>

            {/* Divider */}
            <div className="w-6 h-px bg-white/[0.08] my-1.5" />

            {/* Back to Dashboard */}
            <Link
                href="/dashboard"
                className="group relative p-2 rounded-lg text-white/30 hover:text-purple-300 hover:bg-purple-500/10 transition-all duration-200 active:scale-90"
                title="Back to Dashboard"
            >
                <LayoutDashboard className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-[#1a1030] border border-purple-500/20 text-[11px] font-medium text-purple-200 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 shadow-lg shadow-purple-900/30">
                    Dashboard
                </span>
            </Link>
        </aside>
    );
}