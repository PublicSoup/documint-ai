"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, File, Settings, Users, Terminal, Sidebar, CreditCard, LogOut, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const router = useRouter();
    const [query, setQuery] = React.useState("");
    const [activeIndex, setActiveIndex] = React.useState(0);

    const commands = [
        {
            category: "Navigation",
            items: [
                { icon: Home, label: "Go to Dashboard", action: () => router.push("/dashboard") },
                { icon: Settings, label: "Settings", action: () => router.push("/dashboard/settings") },
                { icon: Users, label: "Team Management", action: () => router.push("/dashboard/settings/team") },
                { icon: CreditCard, label: "Billing", action: () => router.push("/dashboard/billing") },
            ]
        },
        {
            category: "Actions",
            items: [
                { icon: File, label: "New File", action: () => { /* Handle in parent or via event */ } },
                { icon: Terminal, label: "Toggle Terminal", action: () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', ctrlKey: true })) } },
                { icon: Sidebar, label: "Toggle Sidebar", action: () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })) } },
            ]
        }
    ];

    const filteredCommands = commands.map(group => ({
        ...group,
        items: group.items.filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
    })).filter(group => group.items.length > 0);

    const flatItems = filteredCommands.flatMap(group => group.items);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onOpenChange(!open);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, [open, onOpenChange]);

    React.useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    // Handle arrow navigation
    React.useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => (i + 1) % flatItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => (i - 1 + flatItems.length) % flatItems.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = flatItems[activeIndex];
                if (item) {
                    item.action();
                    onOpenChange(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, flatItems, activeIndex, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="p-0 gap-0 bg-[#1e1e1e] border-white/10 text-white shadow-2xl overflow-hidden max-w-xl top-[20%] translate-y-0">
                <div className="flex items-center border-b border-white/5 px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto p-2">
                    {filteredCommands.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground text-center">No results found.</p>
                    ) : (
                        filteredCommands.map((group, groupIndex) => (
                            <div key={group.category} className="mb-2">
                                <h4 className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.category}</h4>
                                {group.items.map((item, itemIndex) => {
                                    // Calculate global index for highlighting
                                    const globalIndex = flatItems.indexOf(item);
                                    const isActive = globalIndex === activeIndex;

                                    return (
                                        <div
                                            key={item.label}
                                            onClick={() => {
                                                item.action();
                                                onOpenChange(false);
                                            }}
                                            className={cn(
                                                "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none",
                                                isActive ? "bg-primary/20 text-primary" : "text-white hover:bg-white/5"
                                            )}
                                        >
                                            <item.icon className="mr-2 h-4 w-4" />
                                            <span>{item.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
                <div className="border-t border-white/5 px-4 py-2 text-[10px] text-muted-foreground flex justify-between">
                    <div className="flex gap-2">
                        <span>↑↓ to navigate</span>
                        <span>↵ to select</span>
                    </div>
                    <span>Esc to close</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}
