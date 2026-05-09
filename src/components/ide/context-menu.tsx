"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
    label: string;
    icon?: LucideIcon;
    shortcut?: string;
    onClick?: () => void;
    disabled?: boolean;
    variant?: "default" | "danger";
    separator?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleScroll = () => onClose();
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            onClose();
        };

        window.addEventListener("click", handleClick);
        window.addEventListener("scroll", handleScroll, true);
        window.addEventListener("contextmenu", handleContextMenu);

        return () => {
            window.removeEventListener("click", handleClick);
            window.removeEventListener("scroll", handleScroll, true);
            window.removeEventListener("contextmenu", handleContextMenu);
        };
    }, [onClose]);

    // Adjust position if out of bounds
    const adjustedX = Math.min(x, window.innerWidth - 220); // Width is roughly 200px
    const adjustedY = Math.min(y, window.innerHeight - (items.length * 36 + 20));

    return (
        <AnimatePresence>
            <motion.div
                ref={ref}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                style={{ top: adjustedY, left: adjustedX }}
                className="fixed z-[9999] min-w-[200px] bg-[#1e1e1e]/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl p-1.5 flex flex-col gap-0.5 overflow-hidden"
            >
                {items.map((item, i) => {
                    if (item.separator) {
                        return <div key={i} className="h-px bg-white/10 my-1 mx-2" />;
                    }

                    const Icon = item.icon;

                    return (
                        <button
                            key={i}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!item.disabled && item.onClick) {
                                    item.onClick();
                                    onClose();
                                }
                            }}
                            disabled={item.disabled}
                            className={cn(
                                "flex items-center w-full px-2 py-1.5 text-xs rounded-md transition-colors",
                                item.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                                item.variant === "danger"
                                    ? "text-red-400 hover:bg-red-500/10"
                                    : "text-gray-200 hover:bg-white/10 hover:text-white"
                            )}
                        >
                            {Icon && <Icon className="w-4 h-4 mr-2 opacity-70" />}
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.shortcut && (
                                <span className="ml-3 text-[10px] opacity-40 font-mono tracking-wider">{item.shortcut}</span>
                            )}
                        </button>
                    );
                })}
            </motion.div>
        </AnimatePresence>
    );
}
