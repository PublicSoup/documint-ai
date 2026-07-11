"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { GraphDataNode } from "@/lib/graph/graph-data";
import { RISK_STYLE, TYPE_STYLE, riskTier } from "../graph-theme";

// React Flow constrains node data to `Record<string, unknown>`; intersecting it
// keeps our fields typed while satisfying the index-signature requirement.
export type FileNodeData = GraphDataNode & {
    variant: "dependency" | "class";
    dimmed: boolean;
    highlighted: boolean;
} & Record<string, unknown>;

export type FileNodeType = Node<FileNodeData, "file">;

export const FILE_NODE_SIZE = {
    dependency: { width: 208, height: 76 },
    class: { width: 224, height: 150 },
} as const;

function FileNodeComponent({ data }: NodeProps<FileNodeType>) {
    const style = TYPE_STYLE[data.type];
    const Icon = style.icon;
    const tier = riskTier(data.riskScore);
    const risk = RISK_STYLE[tier];
    const isClass = data.variant === "class";
    const size = FILE_NODE_SIZE[data.variant];

    return (
        <div
            className="group relative rounded-xl border backdrop-blur-sm transition-all duration-150"
            style={{
                width: size.width,
                minHeight: size.height,
                background: `linear-gradient(180deg, ${style.fill}, rgba(9, 9, 11, 0.72))`,
                borderColor: data.highlighted ? style.accent : "rgba(63, 63, 70, 0.9)",
                boxShadow: data.highlighted
                    ? `0 0 0 1px ${style.accent}, 0 8px 28px -8px ${risk.ring}`
                    : "0 4px 14px -8px rgba(0,0,0,0.6)",
                opacity: data.dimmed ? 0.25 : 1,
            }}
        >
            <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />

            {/* Risk rail */}
            <div
                className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
                style={{ background: risk.color }}
                title={risk.label}
            />

            <div className="pl-4 pr-3 py-2.5">
                <div className="flex items-center gap-2">
                    <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                        style={{ background: style.fill, color: style.accent }}
                    >
                        <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="truncate text-[13px] font-semibold text-zinc-100" title={data.id}>
                        {data.name}
                    </span>
                </div>

                <div className="mt-1.5 flex items-center gap-2 text-[10px] font-medium">
                    <span
                        className="rounded px-1.5 py-0.5"
                        style={{ background: style.fill, color: style.text }}
                    >
                        {style.label}
                    </span>
                    <span className="flex items-center gap-0.5 text-zinc-500" title="Imported by (fan-in)">
                        <ArrowDownRight className="h-3 w-3" />
                        {data.inDegree}
                    </span>
                    <span className="flex items-center gap-0.5 text-zinc-500" title="Imports (fan-out)">
                        <ArrowUpRight className="h-3 w-3" />
                        {data.outDegree}
                    </span>
                    {tier === "high" && (
                        <span className="ml-auto flex items-center gap-0.5" style={{ color: risk.color }}>
                            <AlertTriangle className="h-3 w-3" />
                            {data.riskScore}
                        </span>
                    )}
                </div>

                {isClass && (
                    <div className="mt-2 border-t border-white/5 pt-1.5">
                        {data.exports.length === 0 ? (
                            <p className="text-[10px] italic text-zinc-600">no exports</p>
                        ) : (
                            <ul className="space-y-0.5">
                                {data.exports.slice(0, 4).map((exp) => (
                                    <li
                                        key={exp}
                                        className="flex items-center gap-1.5 text-[10px] text-zinc-400"
                                    >
                                        <span style={{ color: style.accent }}>+</span>
                                        <span className="truncate font-mono">{exp}</span>
                                    </li>
                                ))}
                                {data.exports.length > 4 && (
                                    <li className="text-[10px] text-zinc-600">
                                        +{data.exports.length - 4} more
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
        </div>
    );
}

export const FileNode = memo(FileNodeComponent);
