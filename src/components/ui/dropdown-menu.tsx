"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
    trigger: React.ReactNode;
    children: React.ReactNode;
    align?: "left" | "right";
}

export function DropdownMenu({ trigger, children, align = "left" }: DropdownMenuProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative inline-block" ref={containerRef}>
            <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
                {trigger}
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                        transition={{ duration: 0.1, ease: "easeOut" }}
                        className={cn(
                            "absolute z-50 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-white/10 bg-[#1e1e21] p-1 shadow-xl shadow-black/50 backdrop-blur-xl",
                            align === "left" ? "left-0" : "right-0"
                        )}
                    >
                        <div onClick={() => setIsOpen(false)}>{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

interface DropdownMenuItemProps {
    children: React.ReactNode;
    onClick?: () => void;
    shortcut?: string;
    variant?: "default" | "danger";
    disabled?: boolean;
}

export function DropdownMenuItem({
    children,
    onClick,
    shortcut,
    variant = "default",
    disabled = false
}: DropdownMenuItemProps) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[11px] transition-colors focus:outline-none",
                variant === "default"
                    ? "text-gray-300 hover:bg-primary hover:text-white"
                    : "text-red-400 hover:bg-red-500/10 hover:text-red-300",
                disabled && "pointer-events-none opacity-50"
            )}
        >
            <span className="flex items-center gap-2">{children}</span>
            {shortcut && <span className="ml-auto pl-4 text-[9px] text-white/20">{shortcut}</span>}
        </button>
    );
}

export function DropdownMenuSeparator() {
    return <div className="my-1 h-px bg-white/5" />;
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
    return <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/20 select-none">{children}</div>;
}
