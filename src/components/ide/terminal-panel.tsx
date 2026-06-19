import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { WebContainerTerminal } from "./webcontainer-terminal";
import { useToast } from "@/components/toast";
import {
    ChevronUp,
    ChevronDown,
    X,
    Trash2,
} from "lucide-react";
import type { Terminal } from "@xterm/xterm";

interface TerminalPanelProps {
    terminalMaximized: boolean;
    setTerminalMaximized: (val: boolean) => void;
    setShowTerminal: (val: boolean) => void;
    setTerminalInstance: (val: Terminal | null) => void;
    onBeforeCommand?: () => Promise<{ cwd?: string } | void>;
}

export function TerminalPanel({
    terminalMaximized,
    setTerminalMaximized,
    setShowTerminal,
    setTerminalInstance,
    onBeforeCommand
}: TerminalPanelProps) {
    const { toast } = useToast();
    const [terminalInstance, setLocalTerminalInstance] = useState<Terminal | null>(null);
    const handleTerminalReady = useCallback((term: Terminal) => {
        setLocalTerminalInstance(term);
        setTerminalInstance(term);
    }, [setTerminalInstance]);

    const handleClose = () => {
        setTerminalInstance(null);
        setShowTerminal(false);
    };

    return (
        <div className={cn("flex-none border-t border-white/[0.06] bg-[#020010] flex flex-col shadow-[0_-4px_30px_rgba(0,0,0,0.5)] z-20", terminalMaximized ? "h-[60vh]" : "h-32")}>
            <div className="flex-none h-8 flex items-center justify-between px-3 border-b border-white/[0.04] select-none bg-[#030014]">
                <div className="flex items-center gap-4 h-full">
                    <button type="button" disabled className="h-full text-[11px] font-medium text-white/80 flex items-center gap-1.5 px-2 relative cursor-default">
                        Terminal
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 to-violet-400" />
                    </button>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            terminalInstance?.clear();
                            toast('Terminal cleared', "success");
                        }}
                        disabled={!terminalInstance}
                        className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        title={terminalInstance ? "Clear Terminal" : "Terminal is starting"}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-3 bg-white/[0.06] mx-1" />
                    <button
                        type="button"
                        onClick={() => setTerminalMaximized(!terminalMaximized)}
                        className="p-1 rounded hover:bg-white/[0.06] text-white/25 hover:text-white/60 transition-colors"
                        title={terminalMaximized ? 'Restore' : 'Maximize'}
                    >
                        {terminalMaximized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="p-1 rounded hover:bg-red-500/10 text-white/25 hover:text-red-400 transition-colors"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-[#020010] p-1 pl-3 overflow-hidden">
                <WebContainerTerminal
                    onReady={handleTerminalReady}
                    onBeforeCommand={onBeforeCommand}
                    onProcessStart={() => {
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
