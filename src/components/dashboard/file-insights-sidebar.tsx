"use client";

import { useState, useEffect } from "react";
import {
    Hash,
    Braces,
    Package,
    AlertTriangle,
    Ruler,
    Activity,
    BookOpen,
    HardDrive,
    Clock,
    Zap,
    FileText,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    RefreshCw,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

interface MetricsData {
    file: {
        id: string;
        name: string;
        language: string;
        size: number;
        createdAt: string;
        updatedAt: string;
    };
    metrics: {
        loc: number;
        sloc: number;
        imports: number;
        exports: number;
        functions: number;
        classes: number;
        interfaces: number;
        todoCount: number;
        avgLineLength: number;
        docCoverage: number;
        riskScore: number;
        language: string;
    };
    documentation: {
        exists: boolean;
        status: string | null;
        verifiedAt: string | null;
        summary: string | null;
    };
}

interface FileInsightsSidebarProps {
    fileId: string;
    teamId?: string;
}

// ── Metric tile ────────────────────────────────────────────────────────────

function MetricTile({
    icon: Icon,
    label,
    value,
    color = "text-white",
}: {
    icon: LucideIcon;
    label: string;
    value: string | number;
    color?: string;
}) {
    return (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 text-white/30" />
                <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">
                    {label}
                </span>
            </div>
            <span className={cn("text-lg font-black tracking-tighter", color)}>
                {value}
            </span>
        </div>
    );
}

// ── Coverage bar ───────────────────────────────────────────────────────────

function CoverageBar({ percent }: { percent: number }) {
    const color =
        percent >= 80
            ? "bg-emerald-500"
            : percent >= 50
              ? "bg-amber-500"
              : "bg-rose-500";

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">
                    Doc Coverage
                </span>
                <span
                    className={cn(
                        "text-xs font-bold",
                        percent >= 80
                            ? "text-emerald-400"
                            : percent >= 50
                              ? "text-amber-400"
                              : "text-rose-400"
                    )}
                >
                    {percent}%
                </span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all duration-700", color)}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

// ── Risk badge ─────────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
    const { text, bg, border, label } =
        score <= 30
            ? {
                  text: "text-emerald-400",
                  bg: "bg-emerald-500/10",
                  border: "border-emerald-500/20",
                  label: "Low",
              }
            : score <= 60
              ? {
                    text: "text-amber-400",
                    bg: "bg-amber-500/10",
                    border: "border-amber-500/20",
                    label: "Medium",
                }
              : score <= 80
                ? {
                      text: "text-orange-400",
                      bg: "bg-orange-500/10",
                      border: "border-orange-500/20",
                      label: "High",
                  }
                : {
                      text: "text-rose-400",
                      bg: "bg-rose-500/10",
                      border: "border-rose-500/20",
                      label: "Critical",
                  };

    return (
        <div className={cn("px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider", text, bg, border)}>
            {label} ({score})
        </div>
    );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
    title,
    defaultOpen = true,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-t border-white/[0.04]">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
            >
                {isOpen ? (
                    <ChevronDown className="w-3 h-3 text-white/20" />
                ) : (
                    <ChevronRight className="w-3 h-3 text-white/20" />
                )}
                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">
                    {title}
                </span>
            </button>
            {isOpen && <div className="px-4 pb-3">{children}</div>}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

export function FileInsightsSidebar({ fileId, teamId }: FileInsightsSidebarProps) {
    const [data, setData] = useState<MetricsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/files/${fileId}/metrics`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load metrics");
                return res.json();
            })
            .then((d: MetricsData) => {
                if (!cancelled) {
                    setData(d);
                    setLoading(false);
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Failed to load");
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [fileId]);

    if (loading) {
        return <SidebarSkeleton />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-400/50 mb-3" />
                <p className="text-xs text-white/40 mb-3">{error}</p>
                <button
                    type="button"
                    onClick={() => {
                        setLoading(true);
                        setError(null);
                        fetch(`/api/files/${fileId}/metrics`)
                            .then((r) => r.json())
                            .then(setData)
                            .catch(() => setError("Failed to load"))
                            .finally(() => setLoading(false));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-[10px] font-bold text-white/50 hover:bg-white/10 transition-colors"
                >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                </button>
            </div>
        );
    }

    if (!data) return null;

    const { file, metrics, documentation } = data;

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="p-4 border-b border-white/[0.04] space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{file.name}</h3>
                        <p className="text-[10px] text-white/30 mt-0.5">
                            {file.language} · Updated{" "}
                            {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
                        </p>
                    </div>
                    <RiskBadge score={metrics.riskScore} />
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="p-4">
                <div className="grid grid-cols-2 gap-2">
                    <MetricTile icon={Hash} label="LOC" value={metrics.loc.toLocaleString()} />
                    <MetricTile icon={Braces} label="SLOC" value={metrics.sloc.toLocaleString()} />
                    <MetricTile icon={Package} label="Imports" value={metrics.imports} />
                    <MetricTile
                        icon={Activity}
                        label="Functions"
                        value={metrics.functions}
                    />
                    <MetricTile
                        icon={AlertTriangle}
                        label="TODOs"
                        value={metrics.todoCount}
                        color={metrics.todoCount > 0 ? "text-amber-400" : "text-emerald-400"}
                    />
                    <MetricTile
                        icon={Ruler}
                        label="Avg Line"
                        value={`${metrics.avgLineLength}ch`}
                    />
                    <MetricTile
                        icon={BookOpen}
                        label="Doc %"
                        value={`${Math.round(metrics.docCoverage * 100)}%`}
                    />
                    <MetricTile
                        icon={HardDrive}
                        label="Size"
                        value={
                            file.size >= 1024
                                ? `${(file.size / 1024).toFixed(1)}KB`
                                : `${file.size}B`
                        }
                    />
                </div>
            </div>

            {/* Coverage */}
            <Section title="Documentation Coverage">
                <CoverageBar percent={Math.round(metrics.docCoverage * 100)} />
            </Section>

            {/* Documentation Status */}
            <Section title="Documentation">
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div
                            className={cn(
                                "w-2 h-2 rounded-full",
                                documentation.status === "APPROVED"
                                    ? "bg-emerald-500"
                                    : documentation.status === "REVIEW"
                                      ? "bg-blue-500"
                                      : documentation.status === "DRAFT"
                                        ? "bg-amber-500"
                                        : "bg-white/20"
                            )}
                        />
                        <span className="text-xs text-white/60">
                            {documentation.status
                                ? `Status: ${documentation.status}`
                                : "No documentation generated"}
                        </span>
                    </div>

                    {documentation.verifiedAt && (
                        <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                            <Clock className="w-3 h-3" />
                            Verified{" "}
                            {formatDistanceToNow(new Date(documentation.verifiedAt), {
                                addSuffix: true,
                            })}
                        </div>
                    )}

                    {documentation.summary && (
                        <p className="text-[11px] text-white/40 leading-relaxed line-clamp-4">
                            {documentation.summary}
                        </p>
                    )}

                    <div className="flex gap-2">
                        {documentation.exists ? (
                            <Link
                                href={`/dashboard?docId=${fileId}${teamId ? `&teamId=${teamId}` : ""}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-[10px] font-bold text-primary hover:bg-primary/20 transition-colors"
                            >
                                <FileText className="w-3 h-3" />
                                Open in Doc Editor
                            </Link>
                        ) : (
                            <Link
                                href={`/dashboard?docId=${fileId}${teamId ? `&teamId=${teamId}` : ""}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-[10px] font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
                            >
                                <Zap className="w-3 h-3" />
                                Generate Docs
                            </Link>
                        )}
                    </div>
                </div>
            </Section>

            {/* Exports & Interfaces */}
            {(metrics.exports > 0 || metrics.interfaces > 0 || metrics.classes > 0) && (
                <Section title="Symbols">
                    <div className="space-y-1">
                        {metrics.exports > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-white/40">Exports</span>
                                <span className="font-mono text-white/60">{metrics.exports}</span>
                            </div>
                        )}
                        {metrics.classes > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-white/40">Classes</span>
                                <span className="font-mono text-white/60">{metrics.classes}</span>
                            </div>
                        )}
                        {metrics.interfaces > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-white/40">Interfaces</span>
                                <span className="font-mono text-white/60">{metrics.interfaces}</span>
                            </div>
                        )}
                        {metrics.functions > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                                <span className="text-white/40">Functions</span>
                                <span className="font-mono text-white/60">{metrics.functions}</span>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* Export actions */}
            <div className="p-4 border-t border-white/[0.04]">
                <a
                    href={`/api/files/${fileId}/raw`}
                    download
                    className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-white/5 text-[10px] font-bold text-white/40 hover:bg-white/10 hover:text-white/60 transition-colors"
                >
                    <ExternalLink className="w-3 h-3" />
                    Download Raw File
                </a>
            </div>
        </div>
    );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SidebarSkeleton() {
    return (
        <div className="h-full overflow-hidden animate-pulse">
            <div className="p-4 border-b border-white/[0.04] space-y-2">
                <div className="h-4 bg-white/5 rounded w-3/4" />
                <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white/[0.03] space-y-1">
                        <div className="h-2 bg-white/5 rounded w-1/2" />
                        <div className="h-4 bg-white/5 rounded w-1/3" />
                    </div>
                ))}
            </div>
            <div className="px-4 pb-3 space-y-2">
                <div className="h-2 bg-white/5 rounded w-1/3" />
                <div className="h-1.5 bg-white/5 rounded-full w-full" />
            </div>
        </div>
    );
}