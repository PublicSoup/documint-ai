"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Terminal, CheckCircle2, AlertCircle, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

import { ThoughtStep } from "./chat/types";

interface ThinkingProcessProps {
    steps: ThoughtStep[];
    isThinking: boolean;
}

export function ThinkingProcess({ steps, isThinking }: ThinkingProcessProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    if (steps.length === 0 && !isThinking) return null;

    return (
        <div className="mb-4 rounded-lg border border-white/10 bg-black/20 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors text-xs font-medium text-white/70"
            >
                {isThinking ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                ) : (
                    <BrainCircuit className="w-3.5 h-3.5 text-primary" />
                )}
                <span>
                    {isThinking ? "Agent is working..." : "Process Log"}
                </span>
                <span className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full text-white/40">
                        {steps.length} steps
                    </span>
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </span>
            </button>

            {isExpanded && (
                <div className="p-2 space-y-1 bg-black/20 max-h-[200px] overflow-y-auto custom-scrollbar">
                    {steps.map((step) => (
                        <div key={step.id} className="flex gap-2 text-[11px] p-1.5 rounded hover:bg-white/5">
                            <div className="mt-0.5 shrink-0">
                                {step.type === 'thought' && <div className="w-1.5 h-1.5 rounded-full bg-white/20" />}
                                {step.type === 'tool_call' && <Terminal className="w-3 h-3 text-blue-400" />}
                                {step.type === 'tool_result' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                                {step.type === 'error' && <AlertCircle className="w-3 h-3 text-red-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                {step.type === 'tool_call' && step.toolName && (
                                    <span className="font-mono text-blue-300 mr-1.5 font-bold">
                                        {step.toolName}
                                    </span>
                                )}
                                <span className={cn(
                                    "text-white/60 whitespace-pre-wrap break-words",
                                    step.type === 'error' && "text-red-300",
                                    step.type === 'tool_result' && "text-green-300/80 italic"
                                )}>
                                    {step.content}
                                </span>
                            </div>
                            <div className="text-[9px] text-white/20 tabular-nums shrink-0">
                                {new Date(step.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })}
                            </div>
                        </div>
                    ))}
                    {isThinking && (
                        <div className="flex items-center gap-2 p-1.5 animate-pulse">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                            <span className="text-[10px] text-primary/50 italic">Thinking...</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
