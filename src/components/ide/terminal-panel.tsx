import { useState } from "react";
import { cn } from "@/lib/utils";
import { WebContainerTerminal } from "./webcontainer-terminal";
import { useToast } from "@/components/toast";
import {
    ChevronUp,
    ChevronDown,
    X,
    Trash2,
    SplitSquareHorizontal
} from "lucide-react";

interface TerminalPanelProps {
    terminalMaximized: boolean;
    setTerminalMaximized: (val: boolean) => void;
    setShowTerminal: (val: boolean) => void;
    setTerminalInstance: (val: any) => void;
}

export function TerminalPanel({
    terminalMaximized,
    setTerminalMaximized,
    setShowTerminal,
    setTerminalInstance
}: TerminalPanelProps) {
    const { toast } = useToast();

    return (
        <div className={cn("flex-none border-t border-white/[0.06] bg-[#020010] flex flex-col shadow-[0_-4px_30px_rgba(0,0,0,0.5)] z-20", terminalMaximized ? "h-[60vh]" : "h-32")}>
            <div className="flex-none h-8 flex items-center justify-between px-3 border-b border-white/[0.04] select-none bg-[#030014]">
                <div className="flex items-center gap-4 h-full">
                    <button className="h-full text-[11px] font-medium text-white/80 flex items-center gap-1.5 px-2 relative">
                        WebContainerTerminal
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 to-violet-400" />
                    </button>
                    <button className="h-full text-[11px] font-medium text-white/25 hover:text-white/50 flex items-center gap-1.5 px-2 transition-colors">
                        Output
                    </button>
                    <button className="h-full text-[11px] font-medium text-white/25 hover:text-white/50 flex items-center gap-1.5 px-2 transition-colors">
                        Problems
                        <span className="bg-purple-500/15 text-purple-300/60 px-1 rounded-full text-[9px] font-bold">0</span>
                    </button>
                    <button className="h-full text-[11px] font-medium text-white/25 hover:text-white/50 flex items-center gap-1.5 px-2 transition-colors">
                        Debug Console
                    </button>
                </div>
                <div className="flex items-center gap-1.5">
                    <button className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors" title="Split">
                        <SplitSquareHorizontal className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => {
                            toast('Terminal clear not available in interactive mode', "warning");
                        }}
                        className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors"
                        title="Clear Terminal"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-3 bg-white/[0.06] mx-1" />
                    <button
                        onClick={() => setTerminalMaximized(!terminalMaximized)}
                        className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors"
                        title={terminalMaximized ? 'Restore' : 'Maximize'}
                    >
                        {terminalMaximized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        onClick={() => setShowTerminal(false)}
                        className="p-1 rounded hover:bg-red-500/10 text-white/25 hover:text-red-400 transition-colors"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-[#020010] p-1 pl-3 overflow-hidden">
                <WebContainerTerminal
                    onProcessStart={(process) => {
                        setTerminalInstance(null); // Clear old instance
                        toast("Command started in terminal", "success");
                    }}
                    onProcessExit={(code) => {
                        toast(`Command exited with code ${code}`, code === 0 ? "success" : "error");
                    }}
                    onError={(error) => {
                        toast(`Terminal error: ${error.message}`, "error");
                    }}
                />
            </div>
        </div>
    );
}
