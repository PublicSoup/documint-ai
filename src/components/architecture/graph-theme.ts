/**
 * Shared visual language for every architecture view (canvas, sequence,
 * mindmap). Keeping type colours, icons, and risk tiers in one place is what
 * makes the views read as one system instead of three unrelated widgets.
 */

import {
    Boxes,
    FileCode2,
    FileText,
    Layers,
    Plug,
    Puzzle,
    type LucideIcon,
} from "lucide-react";
import type { NodeType } from "@/lib/graph/project-graph";

export interface TypeStyle {
    label: string;
    icon: LucideIcon;
    /** Accent (border / glyph) — a saturated hue. */
    accent: string;
    /** Translucent fill for node backgrounds. */
    fill: string;
    /** Text colour for the type chip. */
    text: string;
}

export const TYPE_STYLE: Record<NodeType, TypeStyle> = {
    page: {
        label: "Page",
        icon: FileText,
        accent: "#38bdf8",
        fill: "rgba(56, 189, 248, 0.10)",
        text: "#7dd3fc",
    },
    component: {
        label: "Component",
        icon: Puzzle,
        accent: "#a78bfa",
        fill: "rgba(167, 139, 250, 0.10)",
        text: "#c4b5fd",
    },
    hook: {
        label: "Hook",
        icon: Layers,
        accent: "#f472b6",
        fill: "rgba(244, 114, 182, 0.10)",
        text: "#f9a8d4",
    },
    api: {
        label: "API",
        icon: Plug,
        accent: "#34d399",
        fill: "rgba(52, 211, 153, 0.10)",
        text: "#6ee7b7",
    },
    lib: {
        label: "Lib",
        icon: Boxes,
        accent: "#fbbf24",
        fill: "rgba(251, 191, 36, 0.10)",
        text: "#fcd34d",
    },
    unknown: {
        label: "Other",
        icon: FileCode2,
        accent: "#94a3b8",
        fill: "rgba(148, 163, 184, 0.10)",
        text: "#cbd5e1",
    },
};

export type RiskTier = "high" | "med" | "low";

export function riskTier(score: number): RiskTier {
    if (score > 75) return "high";
    if (score > 45) return "med";
    return "low";
}

export const RISK_STYLE: Record<RiskTier, { label: string; color: string; ring: string }> = {
    high: { label: "High risk", color: "#fb7185", ring: "rgba(251, 113, 133, 0.55)" },
    med: { label: "Medium risk", color: "#fbbf24", ring: "rgba(251, 191, 36, 0.45)" },
    low: { label: "Low risk", color: "#34d399", ring: "rgba(52, 211, 153, 0.35)" },
};
