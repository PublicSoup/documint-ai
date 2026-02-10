
import React from "react";
import { Files, Search as SearchIcon, GitBranch, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityBarProps {
    activeTab: "explorer" | "search" | "git";
    showSidebar: boolean;
    onTabClick: (tab: "explorer" | "search" | "git") => void;
}

export function ActivityBar({ activeTab, showSidebar, onTabClick }: ActivityBarProps) {
    return (
        <div className="w-12 flex-none flex flex-col items-center py-4 gap-4 border-r border-white/5 bg-[#18181b] z-40 h-full overflow-hidden">
            <button
                onClick={() => onTabClick("explorer")}
                className={cn(
                    "p-2 rounded-lg transition-all",
                    showSidebar && activeTab === "explorer" ? "bg-primary/20 text-primary shadow-glow" : "text-white/40 hover:text-white/70"
                )}
                title="Explorer"
            >
                <Files className="w-5 h-5" />
            </button>
            <button
                onClick={() => onTabClick("search")}
                className={cn(
                    "p-2 rounded-lg transition-all",
                    showSidebar && activeTab === "search" ? "bg-primary/20 text-primary shadow-glow" : "text-white/40 hover:text-white/70"
                )}
                title="Search"
            >
                <SearchIcon className="w-5 h-5" />
            </button>
            <button
                onClick={() => onTabClick("git")}
                className={cn(
                    "p-2 rounded-lg transition-all",
                    showSidebar && activeTab === "git" ? "bg-primary/20 text-primary shadow-glow" : "text-white/40 hover:text-white/70"
                )}
                title="Source Control"
            >
                <GitBranch className="w-5 h-5" />
            </button>
            <div className="mt-auto flex flex-col gap-4">
                <button className="p-2 text-white/40 hover:text-white/70 transition-colors" title="Settings">
                    <Settings className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
