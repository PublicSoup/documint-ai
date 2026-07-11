"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Shield, Bug, Zap, Paintbrush, AlertTriangle, FlaskConical, FileText,
    Sparkles, FileCode2, CheckCircle2, Loader2, ChevronRight, RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "./toast";

type Severity = "info" | "low" | "medium" | "high" | "critical";
type Category = "security" | "bug" | "performance" | "style" | "breaking" | "tests" | "docs";

interface Finding {
    category: Category;
    severity: Severity;
    file: string;
    line: number | null;
    title: string;
    detail: string;
    suggestion?: string;
}

interface Review {
    id: string;
    title: string | null;
    summary: string | null;
    qualityScore: number;
    grade: string | null;
    riskLevel: string;
    strengths: string[] | null;
    findings: Finding[] | null;
    createdAt: string;
    file?: { id: string; name: string; language: string } | null;
}

interface FileItem {
    id: string;
    name: string;
    language: string;
    updatedAt: string;
}

const SEVERITY_META: Record<Severity, { label: string; text: string; bg: string; ring: string; rank: number }> = {
    critical: { label: "Critical", text: "text-red-300", bg: "bg-red-500/10", ring: "border-red-500/30", rank: 4 },
    high: { label: "High", text: "text-orange-300", bg: "bg-orange-500/10", ring: "border-orange-500/30", rank: 3 },
    medium: { label: "Medium", text: "text-amber-300", bg: "bg-amber-500/10", ring: "border-amber-500/30", rank: 2 },
    low: { label: "Low", text: "text-sky-300", bg: "bg-sky-500/10", ring: "border-sky-500/30", rank: 1 },
    info: { label: "Info", text: "text-white/60", bg: "bg-white/5", ring: "border-white/10", rank: 0 },
};

const CATEGORY_ICON: Record<Category, typeof Shield> = {
    security: Shield,
    bug: Bug,
    performance: Zap,
    style: Paintbrush,
    breaking: AlertTriangle,
    tests: FlaskConical,
    docs: FileText,
};

function scoreColor(score: number): string {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
}

function scoreStroke(score: number): string {
    if (score >= 80) return "#34d399";
    if (score >= 60) return "#fbbf24";
    return "#f87171";
}

function ScoreRing({ score, grade }: { score: number; grade: string | null }) {
    const r = 42;
    const circ = 2 * Math.PI * r;
    const offset = circ - (Math.max(0, Math.min(100, score)) / 100) * circ;
    return (
        <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                <circle
                    cx="50" cy="50" r={r} fill="none" stroke={scoreStroke(score)} strokeWidth="8"
                    strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
                    className="transition-all duration-700 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${scoreColor(score)}`}>{score}</span>
                {grade && <span className="text-xs text-white/50 font-medium">Grade {grade}</span>}
            </div>
        </div>
    );
}

function FindingRow({ f }: { f: Finding }) {
    const meta = SEVERITY_META[f.severity] ?? SEVERITY_META.info;
    const Icon = CATEGORY_ICON[f.category] ?? Bug;
    return (
        <div className={`rounded-xl border ${meta.ring} ${meta.bg} p-4`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${meta.text}`}><Icon className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${meta.ring} ${meta.text}`}>
                            {meta.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-white/40">{f.category}</span>
                        {f.line ? <span className="text-xs text-white/40 font-mono">L{f.line}</span> : null}
                    </div>
                    <p className="text-sm font-medium text-white mt-1.5">{f.title}</p>
                    {f.detail && <p className="text-sm text-white/60 mt-1 leading-relaxed">{f.detail}</p>}
                    {f.suggestion && (
                        <p className="text-sm text-emerald-300/80 mt-2 leading-relaxed">
                            <span className="font-semibold">Fix:</span> {f.suggestion}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function ReviewReport({ review }: { review: Review }) {
    const findings = (review.findings ?? []).slice().sort(
        (a, b) => (SEVERITY_META[b.severity]?.rank ?? 0) - (SEVERITY_META[a.severity]?.rank ?? 0),
    );
    const security = findings.filter((f) => f.category === "security");
    const counts = findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
                <ScoreRing score={review.qualityScore} grade={review.grade} />
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70">
                            Risk: <span className="font-semibold text-white">{review.riskLevel}</span>
                        </span>
                        {(["critical", "high", "medium", "low", "info"] as Severity[])
                            .filter((s) => counts[s])
                            .map((s) => (
                                <span key={s} className={`text-xs px-2.5 py-1 rounded-full border ${SEVERITY_META[s].ring} ${SEVERITY_META[s].text}`}>
                                    {counts[s]} {SEVERITY_META[s].label}
                                </span>
                            ))}
                        {findings.length === 0 && (
                            <span className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> No issues found
                            </span>
                        )}
                    </div>
                    {review.summary && <p className="text-sm text-white/70 leading-relaxed">{review.summary}</p>}
                </div>
            </div>

            {review.strengths && review.strengths.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Strengths</h4>
                    <div className="flex flex-wrap gap-2">
                        {review.strengths.map((s, i) => (
                            <span key={i} className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-200/90">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {security.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-red-300/70 mb-2 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" /> Security ({security.length})
                    </h4>
                    <div className="space-y-2">{security.map((f, i) => <FindingRow key={`sec-${i}`} f={f} />)}</div>
                </div>
            )}

            {findings.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">
                        All findings ({findings.length})
                    </h4>
                    <div className="space-y-2">{findings.map((f, i) => <FindingRow key={i} f={f} />)}</div>
                </div>
            )}
        </div>
    );
}

export function CodeReviewPanel() {
    const { toast } = useToast();
    const [files, setFiles] = useState<FileItem[]>([]);
    const [recent, setRecent] = useState<Review[]>([]);
    const [selectedFileId, setSelectedFileId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [reviewing, setReviewing] = useState(false);
    const [active, setActive] = useState<Review | null>(null);

    const loadRecent = useCallback(async () => {
        try {
            const res = await fetch("/api/reviews/file");
            if (res.ok) {
                const data = await res.json();
                setRecent(data.reviews ?? []);
                if (!active && data.reviews?.[0]) setActive(data.reviews[0]);
            }
        } catch {
            /* ignore */
        }
    }, [active]);

    useEffect(() => {
        (async () => {
            try {
                const [filesRes] = await Promise.all([fetch("/api/files/list")]);
                if (filesRes.ok) {
                    const data = await filesRes.json();
                    setFiles(data.files ?? []);
                    if (data.files?.[0]) setSelectedFileId(data.files[0].id);
                }
                await loadRecent();
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runReview = async (fileId: string) => {
        if (!fileId || reviewing) return;
        setReviewing(true);
        try {
            const res = await fetch("/api/reviews/file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId }),
            });
            const data = await res.json();
            if (res.ok) {
                setActive(data.review);
                setRecent((prev) => [data.review, ...prev.filter((r) => r.id !== data.review.id)]);
                toast("Review complete", "success");
            } else {
                toast(data.message || data.error || "Review failed", "error");
            }
        } catch {
            toast("Error running review", "error");
        } finally {
            setReviewing(false);
        }
    };

    if (loading) {
        return <div className="h-64 glass-card animate-pulse rounded-2xl" />;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: file picker + history */}
            <div className="lg:col-span-1 space-y-4">
                <Card className="glass-card border-none">
                    <CardContent className="p-4 space-y-3">
                        <label className="text-xs font-semibold uppercase tracking-wide text-white/40">Review a file</label>
                        {files.length === 0 ? (
                            <p className="text-sm text-white/50">No files yet. Upload or create code in your project first.</p>
                        ) : (
                            <>
                                <div className="relative">
                                    <FileCode2 className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <select
                                        value={selectedFileId}
                                        onChange={(e) => setSelectedFileId(e.target.value)}
                                        className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                                    >
                                        {files.map((f) => (
                                            <option key={f.id} value={f.id} className="bg-neutral-900">
                                                {f.name}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronRight className="w-4 h-4 text-white/40 absolute right-3 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
                                </div>
                                <Button
                                    variant="primary"
                                    className="w-full"
                                    disabled={reviewing || !selectedFileId}
                                    onClick={() => runReview(selectedFileId)}
                                >
                                    {reviewing ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reviewing…</>
                                    ) : (
                                        <><Sparkles className="w-4 h-4 mr-2" /> Run AI Review</>
                                    )}
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>

                {recent.length > 0 && (
                    <Card className="glass-card border-none">
                        <CardContent className="p-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Recent reviews</h4>
                            <div className="space-y-1.5">
                                {recent.map((r) => (
                                    <button
                                        key={r.id}
                                        onClick={() => setActive(r)}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${
                                            active?.id === r.id ? "bg-white/10 border-white/15" : "bg-transparent border-transparent hover:bg-white/5"
                                        }`}
                                    >
                                        <span className={`text-sm font-bold ${scoreColor(r.qualityScore)} w-8 shrink-0`}>{r.qualityScore}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm text-white truncate">{r.title || r.file?.name || "File"}</span>
                                            <span className="block text-xs text-white/40">
                                                {(r.findings?.length ?? 0)} finding{(r.findings?.length ?? 0) === 1 ? "" : "s"} · {r.riskLevel}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Right: report */}
            <div className="lg:col-span-2">
                <Card className="glass-card border-none min-h-[20rem]">
                    <CardContent className="p-6">
                        {active ? (
                            <>
                                <div className="flex items-center justify-between gap-3 mb-5">
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-semibold text-white truncate">{active.title || active.file?.name || "Review"}</h3>
                                        <p className="text-xs text-white/40">{new Date(active.createdAt).toLocaleString()}</p>
                                    </div>
                                    {active.file?.id && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={reviewing}
                                            onClick={() => runReview(active.file!.id)}
                                            title="Re-run review"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${reviewing ? "animate-spin" : ""}`} />
                                        </Button>
                                    )}
                                </div>
                                <ReviewReport review={active} />
                            </>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center">
                                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                                    <Sparkles className="w-7 h-7 text-purple-300" />
                                </div>
                                <p className="text-white font-medium">No review yet</p>
                                <p className="text-sm text-white/50 max-w-xs mt-1">
                                    Pick a file and run an AI review to see a quality score, security issues, and concrete suggestions.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
