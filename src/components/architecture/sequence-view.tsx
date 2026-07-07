"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProjectGraphData } from "@/lib/graph/graph-data";
import { traceSequence } from "./sequence-trace";
import { TYPE_STYLE } from "./graph-theme";

interface SequenceViewProps {
    data: ProjectGraphData;
    onNodeClick?: (fileId: string) => void;
}

const COL_W = 168;
const HEADER_H = 64;
const ROW_H = 52;
const PAD_X = 24;
const PAD_TOP = 12;

export function SequenceView({ data, onNodeClick }: SequenceViewProps) {
    const [entryId, setEntryId] = useState<string>(() => data.entryPoints[0] ?? data.nodes[0]?.id ?? "");
    const [open, setOpen] = useState(false);

    const trace = useMemo(
        () => (entryId ? traceSequence(data.nodes, data.edges, entryId) : null),
        [data.nodes, data.edges, entryId],
    );

    const entryOptions = useMemo(() => {
        const byId = new Map(data.nodes.map((n) => [n.id, n]));
        return data.entryPoints
            .map((id) => byId.get(id))
            .filter((n): n is NonNullable<typeof n> => Boolean(n));
    }, [data.entryPoints, data.nodes]);

    if (!trace || trace.actors.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                No call flow to trace from this entry point.
            </div>
        );
    }

    const colX = new Map(trace.actors.map((a, i) => [a.id, PAD_X + i * COL_W + COL_W / 2]));
    const svgWidth = PAD_X * 2 + trace.actors.length * COL_W;
    const svgHeight = HEADER_H + PAD_TOP + trace.messages.length * ROW_H + 32;
    const lifelineBottom = HEADER_H + PAD_TOP + trace.messages.length * ROW_H + 8;

    const selectedEntry = data.nodes.find((n) => n.id === entryId);

    return (
        <div className="flex h-full flex-col">
            {/* Entry point selector */}
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
                <span className="text-xs text-zinc-500">Trace from</span>
                <div className="relative">
                    <button
                        onClick={() => setOpen((v) => !v)}
                        className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
                    >
                        {selectedEntry && (
                            <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: TYPE_STYLE[selectedEntry.type].accent }}
                            />
                        )}
                        <span className="max-w-[220px] truncate">{selectedEntry?.name ?? "Select"}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                    </button>
                    {open && (
                        <div className="absolute z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-2xl">
                            {entryOptions.map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => {
                                        setEntryId(n.id);
                                        setOpen(false);
                                    }}
                                    className={
                                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-800 " +
                                        (n.id === entryId ? "bg-zinc-800 text-white" : "text-zinc-300")
                                    }
                                >
                                    <span
                                        className="h-2 w-2 shrink-0 rounded-full"
                                        style={{ background: TYPE_STYLE[n.type].accent }}
                                    />
                                    <span className="truncate">{n.name}</span>
                                    <span className="ml-auto text-[10px] text-zinc-500">
                                        {TYPE_STYLE[n.type].label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <span className="ml-auto text-[11px] text-zinc-500">
                    {trace.messages.length} calls · {trace.actors.length} files
                    {trace.truncated && " · truncated"}
                </span>
            </div>

            {/* Swimlane */}
            <div className="flex-1 overflow-auto p-4">
                <svg width={svgWidth} height={svgHeight} className="min-w-full">
                    <defs>
                        <marker
                            id="seq-arrow"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="7"
                            markerHeight="7"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#818cf8" />
                        </marker>
                    </defs>

                    {/* Lifelines + actor headers */}
                    {trace.actors.map((actor) => {
                        const x = colX.get(actor.id)!;
                        const style = TYPE_STYLE[actor.type];
                        return (
                            <g key={actor.id}>
                                <line
                                    x1={x}
                                    y1={HEADER_H}
                                    x2={x}
                                    y2={lifelineBottom}
                                    stroke="rgba(148,163,184,0.22)"
                                    strokeDasharray="4 4"
                                />
                                <foreignObject
                                    x={x - COL_W / 2 + 6}
                                    y={PAD_TOP}
                                    width={COL_W - 12}
                                    height={HEADER_H - PAD_TOP - 6}
                                >
                                    <button
                                        onClick={() => onNodeClick?.(actor.fileId)}
                                        title={actor.id}
                                        className="flex h-full w-full flex-col items-center justify-center rounded-lg border px-2 text-center transition-colors hover:brightness-125"
                                        style={{
                                            borderColor: style.accent,
                                            background: style.fill,
                                        }}
                                    >
                                        <span className="w-full truncate text-[11px] font-semibold text-zinc-100">
                                            {actor.name}
                                        </span>
                                        <span className="text-[9px]" style={{ color: style.text }}>
                                            {style.label}
                                        </span>
                                    </button>
                                </foreignObject>
                            </g>
                        );
                    })}

                    {/* Messages */}
                    {trace.messages.map((msg, i) => {
                        const x1 = colX.get(msg.from)!;
                        const x2 = colX.get(msg.to)!;
                        const y = HEADER_H + PAD_TOP + i * ROW_H + ROW_H / 2;
                        const midX = (x1 + x2) / 2;
                        return (
                            <g key={i}>
                                <text
                                    x={midX}
                                    y={y - 8}
                                    textAnchor="middle"
                                    className="fill-zinc-400"
                                    style={{ fontSize: 10.5 }}
                                >
                                    {msg.step}. {msg.verb}
                                </text>
                                <line
                                    x1={x1}
                                    y1={y}
                                    x2={x2}
                                    y2={y}
                                    stroke="#818cf8"
                                    strokeWidth={1.4}
                                    markerEnd="url(#seq-arrow)"
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
