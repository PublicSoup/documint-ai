import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface SlashCommand {
    label: string;
    desc: string;
    prompt: string;
}

interface SlashCommandMenuProps {
    commands: SlashCommand[];
    selectedIndex: number;
    onSelect: (cmd: SlashCommand) => void;
}

export function SlashCommandMenu({ commands, selectedIndex, onSelect }: SlashCommandMenuProps) {
    return (
        <div className="absolute bottom-full left-4 mb-2 w-64 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 z-50">
            <div className="p-2 border-b border-white/5 text-[10px] font-medium text-white/40 bg-white/5">
                COMMANDS
            </div>
            <div className="p-1">
                {commands.map((cmd, i) => (
                    <button
                        key={cmd.label}
                        onClick={() => onSelect(cmd)}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                            i === selectedIndex ? "bg-indigo-500/20 text-indigo-300" : "text-white/70 hover:bg-white/5"
                        )}
                    >
                        <div className={cn(
                            "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold",
                            i === selectedIndex ? "bg-indigo-500 text-white" : "bg-white/10 text-white/50"
                        )}>
                            /
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium">{cmd.label}</div>
                            <div className="text-[10px] text-white/30 truncate">{cmd.desc}</div>
                        </div>
                        {i === selectedIndex && <Check className="w-3 h-3" />}
                    </button>
                ))}
            </div>
        </div>
    );
}
