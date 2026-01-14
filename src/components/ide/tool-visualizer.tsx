"use client";

import { useEffect, useState } from "react";
import {
    Terminal,
    Loader2,
    CheckCircle2,
    XCircle,
    FileText,
    Search,
    Database,
    Code2,
    ChevronRight,
    ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolVisualizerProps {
    toolName: string;
    args: string;
    result?: string;
    status: "running" | "completed" | "failed";
    duration?: number;
}

export function ToolVisualizer({ toolName, args, result, status, duration }: ToolVisualizerProps) {
    const [isExpanded, setIsExpanded] = useState(status === "running" || status === "failed");

    // Auto-collapse on success after a delay
    useEffect(() => {
        if (status === "completed") {
            const timer = setTimeout(() => setIsExpanded(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    const getIcon = () => {
        switch (toolName) {
            case "read_file":
            case "read_file_chunk": return <FileText className="w-4 h-4 text-blue-400" />;
            case "write_to_file": return <Code2 className="w-4 h-4 text-purple-400" />;
            case "apply_patch": return <Code2 className="w-4 h-4 text-green-400" />;
            case "list_files": return <Search className="w-4 h-4 text-amber-400" />;
            case "execute_command": return <Terminal className="w-4 h-4 text-emerald-400" />;
            case "grep_search":
            case "search_files": return <Search className="w-4 h-4 text-indigo-400" />;
            case "inspect_schema": return <Database className="w-4 h-4 text-rose-400" />;
            default: return <Terminal className="w-4 h-4 text-gray-400" />;
        }
    };

    const getTitle = () => {
        switch (toolName) {
            case "read_file": return `Reading ${args}`;
            case "read_file_chunk": return `Reading lines ${args}`;
            case "write_to_file": return `Writing to ${args.split(',')[0]}`;
            case "apply_patch": return `Patching ${args.split(',')[0]}`;
            case "list_files": return "Listing files...";
            case "execute_command": return `Running: ${args}`;
            case "search_files": return `Searching for files: ${args}`;
            case "grep_search": return `Searching content: ${args}`;
            case "inspect_schema": return "Inspecting DB Schema";
            default: return `${toolName}(${args})`;
        }
    };

    return (
        <div className="my-3 rounded-lg border border-white/5 bg-[#0f1115] overflow-hidden shadow-sm selection:bg-primary/30">
            {/* Header */}
            <div
                className={cn(
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors",
                    status === "running" && "animate-pulse bg-white/5"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-white/5 border border-white/5 shadow-inner">
                    {status === "running" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    ) : status === "completed" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-200 truncate">
                            {getTitle()}
                        </span>
                        {duration && (
                            <span className="text-[10px] text-gray-600 bg-gray-900/50 px-1.5 py-0.5 rounded">
                                {duration}ms
                            </span>
                        )}
                    </div>
                </div>

                <div className="shrink-0 text-gray-500">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
            </div>

            {/* Expanded Content (Simulated Terminal) */}
            {isExpanded && (
                <div className="border-t border-white/5 bg-[#0a0a0a]">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border-b border-white/5">
                        <Terminal className="w-3 h-3 text-gray-500" />
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Output</span>
                    </div>

                    <div className="p-3 font-mono text-[11px] leading-relaxed overflow-x-auto custom-scrollbar max-h-[200px]">
                        {/* Command Line Representation */}
                        <div className="flex gap-2 text-gray-400 mb-2 border-b border-white/5 pb-2">
                            <span className="text-emerald-500">➜</span>
                            <span className="text-blue-400">~</span>
                            <span>{toolName} {args}</span>
                        </div>

                        {/* Result Output */}
                        {status === "running" ? (
                            <div className="flex items-center gap-2 text-gray-500 italic">
                                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                            </div>
                        ) : (
                            <div className={cn(
                                "whitespace-pre-wrap",
                                status === "failed" ? "text-red-400" : "text-gray-300"
                            )}>
                                {result || "(No output)"}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
