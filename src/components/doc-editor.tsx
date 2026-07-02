"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./toast";
import { useConfirm } from "./ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CodeArchaeology from "./code-archaeology";
import CommentsSection from "./comments-section";
import DocumentationTemplates from "./documentation-templates";
import DocSuggestions from "./doc-suggestions";
import { VerifiedBadge } from "./verified-badge";
import { VersionHistory } from "./version-history";
import { FileText, Edit2, Play, Users, Sparkles, Download, GitBranch, Github, Shovel, Loader2, Workflow, Globe, Save, X, RefreshCw, Headphones, ShieldCheck, Lock, Activity, Check, Trash2, History, Zap, Code2, type LucideIcon } from "lucide-react";
import { useDocActions } from "@/hooks/use-doc-actions";
import { GithubModal } from "./doc-editor/github-modal";
import { DiagramModal } from "./doc-editor/diagram-modal";
import { CodeView } from "./doc-editor/code-view";
import { downloadMarkdown, copyDocToClipboard, exportAsciiDoc, exportRST, exportHTML } from "@/lib/doc-exporters";

const DiagramViewer = dynamic(() => import("./diagram-viewer").then(mod => mod.DiagramViewer), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center p-8 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading Diagram Engine...
        </div>
    )
});

export type ProjectViewMode = "docs" | "archaeology" | "code" | "deep-audit" | "history";

const PROJECT_VIEW_MODE_VALUES = new Set<ProjectViewMode>([
    "docs",
    "archaeology",
    "code",
    "deep-audit",
    "history",
]);

const PROJECT_VIEW_NAV: Array<{
    mode: ProjectViewMode;
    label: string;
    description: string;
    icon: LucideIcon;
    accent: string;
}> = [
    { mode: "docs", label: "Documentation", description: "Approved narrative", icon: FileText, accent: "text-blue-300" },
    { mode: "code", label: "Source", description: "Live source view", icon: Code2, accent: "text-emerald-300" },
    { mode: "history", label: "History", description: "Version audit", icon: History, accent: "text-sky-300" },
    { mode: "archaeology", label: "Archaeology", description: "Legacy signals", icon: Shovel, accent: "text-amber-300" },
    { mode: "deep-audit", label: "Deep Analysis", description: "Risk & topology", icon: ShieldCheck, accent: "text-purple-300" },
];

function normalizeProjectViewMode(value: string | null | undefined): ProjectViewMode {
    if (value === "standard") return "docs";
    return value && PROJECT_VIEW_MODE_VALUES.has(value as ProjectViewMode)
        ? (value as ProjectViewMode)
        : "docs";
}

function ProjectViewSwitcher({
    mode,
    isPro,
    onChange,
}: {
    mode: ProjectViewMode;
    isPro: boolean;
    onChange: (mode: ProjectViewMode) => void;
}) {
    return (
        <div className="w-full rounded-2xl border border-white/10 bg-black/30 p-1 shadow-inner shadow-black/20">
            <div className="grid grid-cols-2 gap-1 md:grid-cols-3 2xl:grid-cols-5">
                {PROJECT_VIEW_NAV.map(({ mode: itemMode, label, description, icon: Icon, accent }) => {
                    const active = mode === itemMode;
                    const gated = itemMode === "deep-audit" && !isPro;

                    return (
                        <button
                            key={itemMode}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange(itemMode)}
                            className={cn(
                                "group rounded-xl border px-3 py-2 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                                active
                                    ? "border-primary/40 bg-primary/15 text-white shadow-lg shadow-primary/10"
                                    : "border-transparent text-white/50 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/80"
                            )}
                        >
                            <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
                                <Icon className={cn("h-3.5 w-3.5", active ? accent : "text-white/30 group-hover:text-white/60")} />
                                {label}
                                {gated && <Lock className="h-3 w-3 text-amber-400/80" />}
                            </span>
                            <span className="mt-1 block truncate text-[10px] text-white/30">
                                {description}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export interface DocEntity {
    type: string;
    name: string;
    code: string;
    doc: string;
    startLine: number;
    endLine: number;
}

export interface DocContent {
    summary: string;
    entities: DocEntity[];
    qualityScore?: number;
    securityInsights?: string[];
    metadata?: {
        linesOfCode?: number;
        functions?: number;
        classes?: number;
        analyzedAt?: string;
    };
    verifiedAt?: string | null;
    verifiedById?: string | null;
    status: "DRAFT" | "REVIEW" | "APPROVED";
    hasProposedChanges?: boolean;
    proposedAt?: string;
}

interface DocEditorProps {
    fileId: string;
    fileName: string;
    fileLanguage: string;
    initialContent: DocContent;
    currentUser?: { id: string; name: string; role: string };
    isPublic: boolean;
    isPro: boolean;
    lockApproved?: boolean;
    initialMode?: ProjectViewMode;
}

export default function DocEditor({ fileId, fileName, fileLanguage, initialContent, currentUser, isPublic: initialPublicState, isPro, lockApproved = false, initialMode = "docs" }: DocEditorProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const confirm = useConfirm();
    const [isEditing, setIsEditing] = useState(false);
    const [content, setContent] = useState<DocContent>(initialContent);
    const [isPublic, setIsPublic] = useState(initialPublicState);

    const {
        isSaving, isRegenerating, regeneratingEntity, verifying, isApproving, sharing, isDeleting, translating, personaLoading,
        handleSaveDoc, handleRegenerateFull, handleRegenerateEntity, handleVerify, handleShareToggle, handleApprove, handleRequestReview, handleDeleteDoc, handleTranslate, handlePersonaExplain
    } = useDocActions(fileId, currentUser);

    const isLocked = lockApproved && content.status === "APPROVED" && currentUser?.role !== "OWNER" && currentUser?.role !== "ADMIN";

    // Persona states
    const [showPersonaModal, setShowPersonaModal] = useState(false);
    const [personaExplanation, setPersonaExplanation] = useState<{ persona: string; text: string } | null>(null);

    // Project view mode is URL-backed so navigation, refreshes, and shared links stay deterministic.
    const [mode, setMode] = useState<ProjectViewMode>(() => initialMode);

    // GitHub Import State
    const [showGithubModal, setShowGithubModal] = useState(false);
    const [githubRepos, setGithubRepos] = useState<any[]>([]);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [pushingToGithub, setPushingToGithub] = useState(false);

    // Diagram State
    const [showDiagramModal, setShowDiagramModal] = useState(false);
    const [diagramType, setDiagramType] = useState("class");
    const [diagramCode, setDiagramCode] = useState("");
    const [generatingDiagram, setGeneratingDiagram] = useState(false);

    // Translation State
    const [currentLang, setCurrentLang] = useState("English");

    // Code View State
    const [rawContent, setRawContent] = useState<string | null>(null);
    const [loadingRaw, setLoadingRaw] = useState(false);

    // AI Architect State
    const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant" | "system"; content: string }[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [sendingChat, setSendingChat] = useState(false);
    const [isSavingCode, setIsSavingCode] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const projectStats = useMemo(() => [
        {
            label: "Quality",
            value: typeof content.qualityScore === "number" ? `${content.qualityScore}/100` : "N/A",
            tone: typeof content.qualityScore === "number" && content.qualityScore >= 80 ? "text-emerald-300" : "text-amber-300",
        },
        {
            label: "LOC",
            value: content.metadata?.linesOfCode?.toLocaleString() ?? "—",
            tone: "text-blue-300",
        },
        {
            label: "Entities",
            value: content.entities?.length.toLocaleString() ?? "0",
            tone: "text-purple-300",
        },
    ], [content.entities?.length, content.metadata?.linesOfCode, content.qualityScore]);

    const teamId = searchParams.get("teamId");
    const analyticsHref = teamId ? `/dashboard/analytics?teamId=${encodeURIComponent(teamId)}` : "/dashboard/analytics";

    useEffect(() => {
        const nextMode = normalizeProjectViewMode(searchParams.get("view"));
        setMode((previous) => previous === nextMode ? previous : nextMode);
    }, [searchParams]);

    const handleModeChange = useCallback((nextMode: ProjectViewMode) => {
        setMode(nextMode);

        const nextParams = new URLSearchParams(searchParams.toString());
        if (nextMode === "docs") {
            nextParams.delete("view");
        } else {
            nextParams.set("view", nextMode);
        }

        const query = nextParams.toString();
        router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    }, [pathname, router, searchParams]);

    useEffect(() => {
        if (mode === 'code') {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatHistory, sendingChat, mode]);

    useEffect(() => {
        if (mode === "code" && !rawContent) {
            const fetchRaw = async () => {
                setLoadingRaw(true);
                try {
                    const res = await fetch(`/api/files/${fileId}/raw`);

                    if (res.status === 402 || res.status === 403) {
                        handleModeChange("docs");
                        const upgrade = await confirm({
                            title: "Code View is a Pro feature",
                            description: "Code View is available on Pro & Team plans. Upgrade to unlock it.",
                            confirmLabel: "View Plans",
                            cancelLabel: "Not Now",
                        });
                        if (upgrade) {
                            router.push("/dashboard/billing");
                        }
                        return;
                    }

                    if (res.ok) {
                        const data = await res.json();
                        setRawContent(data.content);
                    }
                } catch (e) {
                    console.error("Failed to load raw content", e);
                } finally {
                    setLoadingRaw(false);
                }
            };
            fetchRaw();
        }

        // Load chat history from initial content metadata
        if (!historyLoaded && initialContent?.metadata) {
            const metadata = initialContent.metadata as any;
            if (metadata.chatHistory && Array.isArray(metadata.chatHistory)) {
                setChatHistory(metadata.chatHistory);
            }
            setHistoryLoaded(true);
        }
    }, [mode, fileId, rawContent, initialContent, historyLoaded, handleModeChange, router, toast]);

    const handleSendChat = async () => {
        if (!chatInput.trim() || sendingChat) return;

        const userMsg = { role: "user" as const, content: chatInput };
        setChatHistory(prev => [...prev, userMsg]);
        setChatInput("");
        setSendingChat(true);

        try {
            const res = await fetch("/api/ai/architect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileId,
                    code: rawContent, // Code context
                    chatHistory: chatHistory.map(m => ({ role: m.role, content: m.content })), // Send history for memory
                    userPrompt: userMsg.content
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setChatHistory(prev => [...prev, { role: "assistant", content: data.response }]);
            } else {
                toast(data.error || "Failed to get response", "error");
            }
        } catch (e) {
            console.error(e);
            toast("Error communicating with AI Architect", "error");
        } finally {
            setSendingChat(false);
        }
    };

    const handleSaveCode = async () => {
        if (!rawContent || isSavingCode) return;
        setIsSavingCode(true);
        try {
            const res = await fetch(`/api/files/${fileId}/raw`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: rawContent }),
            });

            const data = await res.json();

            if (res.ok) {
                if (data.intentDrift?.drifted) {
                    toast(data.intentDrift.reasoning || "AI detected a documentation drift!", "warning");
                } else {
                    toast("Source code updated successfully!", "success");
                }
                router.refresh();
            } else {
                toast(data.error || "Failed to update code", "error");
            }
        } catch (e) {
            console.error(e);
            toast("Error saving source code", "error");
        } finally {
            setIsSavingCode(false);
        }
    };


    const handleCancel = () => {
        setContent(initialContent);
        setIsEditing(false);
    };

    const updateEntityDoc = (index: number, newDoc: string) => {
        const newEntities = [...content.entities];
        newEntities[index] = { ...newEntities[index], doc: newDoc };
        setContent({ ...content, entities: newEntities });
    };

    const onPersonaExplain = (persona: string) => {
        setShowPersonaModal(true);
        setPersonaExplanation(null); // Reset previous explanation
        handlePersonaExplain(persona, (text: string) => {
            setPersonaExplanation({ persona, text });
        });
    };

    const handleOpenGithubModal = async () => {
        setLoadingRepos(true);
        try {
            const res = await fetch("/api/github/repos");
            const data = await res.json();

            if (data.error === "Unauthorized" || (data.demo && !data.connected)) {
                const goToSettings = await confirm({
                    title: "GitHub not connected",
                    description: "Connect your GitHub account in settings to push documentation as a pull request.",
                    confirmLabel: "Open Settings",
                    cancelLabel: "Not Now",
                });
                if (goToSettings) {
                    router.push("/dashboard/settings?tab=integrations");
                }
                return;
            }

            setGithubRepos(data.repos);
            setShowGithubModal(true);
        } catch (error) {
            console.error(error);
            toast("Failed to load repositories", "error");
        } finally {
            setLoadingRepos(false);
        }
    };

    const handlePushToGithub = async (repoFullName: string) => {
        setPushingToGithub(true);
        try {
            const res = await fetch("/api/github/pr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId, repoFullName }),
            });

            const data = await res.json();

            if (res.ok) {
                setShowGithubModal(false);
                const viewPr = await confirm({
                    title: "Pull request created",
                    description: "Your documentation was pushed to GitHub as a pull request.",
                    confirmLabel: "View on GitHub",
                    cancelLabel: "Done",
                });
                if (viewPr) {
                    window.open(data.prUrl, "_blank");
                }
            } else {
                toast(data.error || "Failed to create PR", "error");
            }
        } catch {
            toast("Something went wrong", "error");
        } finally {
            setPushingToGithub(false);
        }
    };

    const handleGenerateDiagram = async () => {
        setGeneratingDiagram(true);
        // Don't clear code immediately if we change types, maybe? No, clear it to avoid confusion.
        setDiagramCode("");
        try {
            const res = await fetch("/api/diagram/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId, type: diagramType }),
            });
            const data = await res.json();

            if (res.ok) {
                setDiagramCode(data.diagram);
            } else {
                if (data.upgradeUrl) {
                    setShowDiagramModal(false);
                    const goToBilling = await confirm({
                        title: "Upgrade required",
                        description: data.message,
                        confirmLabel: "Go to Billing",
                        cancelLabel: "Not Now",
                    });
                    if (goToBilling) {
                        router.push(data.upgradeUrl);
                    }
                } else {
                    toast(data.error || "Failed to generate diagram", "error");
                }
            }
        } catch (e) {
            console.error(e);
            toast("Error generating diagram", "error");
        } finally {
            setGeneratingDiagram(false);
        }
    };



    return (
        <div className="glass-card p-6 min-h-[500px] border border-white/10 bg-black/20 shadow-2xl shadow-black/20">
            {/* Header */}
            <div className="mb-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-primary/[0.04] p-5 shadow-xl shadow-black/20">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary/80">Enterprise Project View</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-white">{fileName}</h2>
                    <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="px-2 py-1 bg-white/5 border-white/10/10 text-white/70 text-xs rounded uppercase font-bold">{fileLanguage}</span>
                        <VerifiedBadge
                            status={content.verifiedAt ? "VERIFIED" : "UNVERIFIED"}
                            verifiedAt={content.verifiedAt || undefined}
                            verifiedBy={content.verifiedById || undefined}
                        />
                        <span className={cn(
                            "px-2 py-1 text-xs rounded font-bold uppercase tracking-widest",
                            content.status === "APPROVED" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            content.status === "REVIEW" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse" :
                            "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        )}>
                            {content.status}
                        </span>
                        {content.qualityScore && (
                            <span className={`px-2 py-1 text-xs rounded font-bold ${content.qualityScore >= 80 ? 'bg-green-100 text-green-700' :
                                content.qualityScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-red-100 text-red-700'
                                }`}>
                                Score: {content.qualityScore}/100
                            </span>
                        )}
                        {content.metadata?.linesOfCode && (
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded font-bold">
                                {content.metadata.linesOfCode} LOC
                            </span>
                        )}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 max-w-md">
                        {projectStats.map((stat) => (
                            <div key={stat.label} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{stat.label}</p>
                                <p className={cn("mt-1 text-sm font-black", stat.tone)}>{stat.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex max-w-full flex-wrap items-center justify-start gap-2 xl:justify-end">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
                        onClick={() => window.location.href = "/code"}
                    >
                        <Code2 className="mr-2 h-3.5 w-3.5 text-primary" />
                        Open IDE
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
                        onClick={() => router.push(analyticsHref)}
                    >
                        <Activity className="mr-2 h-3.5 w-3.5 text-purple-300" />
                        Analytics
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
                        onClick={() => {
                            const nextParams = new URLSearchParams(searchParams.toString());
                            nextParams.delete("docId");
                            nextParams.delete("view");
                            const query = nextParams.toString();
                            router.push(`${pathname}${query ? `?${query}` : ""}`);
                        }}
                    >
                        Workspace
                    </Button>
                    {!isEditing && (
                        <>
                            <button
                                onClick={() => handleRegenerateFull((data) => { if (data.content) setContent(data.content); router.refresh(); })}
                                disabled={isRegenerating}
                                className="px-3 py-2 text-sm font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 rounded-lg flex items-center gap-2 disabled:opacity-50"
                            >
                                {isRegenerating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Sparkles className="w-4 h-4" />
                                )}
                                {isRegenerating ? "Regenerating..." : "Regenerate AI"}
                            </button>
                            <button
                                onClick={() => setShowPersonaModal(true)}
                                className="px-3 py-2 text-sm font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/100/20 rounded-lg flex items-center gap-2"
                            >
                                <Users className="w-4 h-4" /> Explain
                            </button>
                            <button
                                onClick={() => {
                                    setShowDiagramModal(true);
                                    if (!diagramCode) setDiagramCode("");
                                }}
                                className="px-3 py-2 text-sm font-medium text-pink-300 bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 rounded-lg flex items-center gap-2"
                            >
                                <Workflow className="w-4 h-4" /> Visualize
                            </button>
                            <DocumentationTemplates 
                                fileId={fileId} 
                                fileName={fileName} 
                                teamId={searchParams?.get("teamId") || undefined} 
                            />

                            <button
                                onClick={() => {
                                    if (!content.summary) return;
                                    const utterance = new SpeechSynthesisUtterance(content.summary);
                                    window.speechSynthesis.speak(utterance);
                                }}
                                className="px-3 py-2 text-sm font-medium text-orange-300 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 rounded-lg flex items-center gap-2"
                                title="Listen to summary"
                            >
                                <Headphones className="w-4 h-4" /> Listen
                            </button>

                            <button
                                onClick={() => handleVerify((verified, verifiedAt, verifiedById) => setContent(prev => ({ ...prev, verifiedAt: verified ? verifiedAt : null, verifiedById: verified ? verifiedById : null })))}
                                disabled={verifying}
                                className={`px-3 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors ${content.verifiedAt
                                    ? "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
                                    : "bg-white/5 border-white/10/5 text-white/60 border-white/10 hover:bg-white/5 border-white/10/10"
                                    }`}
                                title={content.verifiedAt ? "Mark as unverified" : "Mark as verified"}
                            >
                                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                {content.verifiedAt ? "Verified" : "Verify"}
                            </button>

                            {/* Translation Dropdown */}
                            <div className="relative group">
                                <button
                                    disabled={translating}
                                    className="px-3 py-2 text-sm font-medium text-white/70 bg-white/5 border-white/10/5 border border-white/10 hover:bg-white/5 border-white/10/10 rounded-lg flex items-center gap-2 disabled:opacity-50"
                                >
                                    {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                    {currentLang}
                                </button>
                                <div className="absolute right-0 top-full mt-1 glass-card bg-[#0A0A0B]/95 border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[120px] overflow-hidden">
                                    {["English", "Spanish", "French", "German", "Japanese", "Chinese"].map(lang => (
                                        <button
                                            key={lang}
                                            onClick={() => handleTranslate(content, currentLang, lang, (newContent, newLang) => { setContent(newContent); setIsEditing(true); setCurrentLang(newLang); })}
                                            className="w-full text-left px-4 py-2 text-sm hover:bg-white/5 border-white/10/10 text-white/80"
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {content.status === "DRAFT" && (
                                <button
                                    onClick={() => handleRequestReview(content, (status) => setContent(prev => ({ ...prev, status: status as "DRAFT" | "REVIEW" | "APPROVED" })))}
                                    disabled={isSaving}
                                    className="px-3 py-2 text-sm font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 rounded-lg flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                                    Request Review
                                </button>
                            )}

                            {content.status === "REVIEW" && (currentUser?.role === "OWNER" || currentUser?.role === "ADMIN") && (
                                <button
                                    onClick={() => handleApprove((verifiedAt, verifiedById) => setContent(prev => ({ ...prev, status: "APPROVED", verifiedAt, verifiedById })))}
                                    disabled={isApproving}
                                    className="px-3 py-2 text-sm font-medium text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-lg flex items-center gap-2 disabled:opacity-50 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)] animate-pulse"
                                >
                                    {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                    Approve Documentation
                                </button>
                            )}

                            <button
                                onClick={() => handleShareToggle(isPublic, setIsPublic)}
                                disabled={sharing}
                                className={`px-3 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors ${isPublic
                                    ? "bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/100/30"
                                    : "bg-white/5 border-white/10/5 text-white/60 border-white/10 hover:bg-white/5 border-white/10/10"
                                    }`}
                                title={isPublic ? "Public - Click to make private" : "Private - Click to share"}
                            >
                                {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                {isPublic ? "Public" : "Share"}
                            </button>

                            {(currentUser?.role === "OWNER" || currentUser?.role === "ADMIN") && (
                                <button
                                    onClick={() => handleDeleteDoc(() => { const url = new URL(window.location.href); url.searchParams.delete("docId"); router.push(url.toString()); router.refresh(); })}
                                    disabled={isDeleting}
                                    className="px-3 py-2 text-sm font-medium text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors"
                                    title="Permanently delete documentation"
                                >
                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Delete
                                </button>
                            )}

                            <div className="relative group">
                                <button
                                    className="px-3 py-2 text-sm font-medium text-white/70 bg-white/5 border-white/10/5 border border-white/10 hover:bg-white/5 border-white/10/10 rounded-lg flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" /> Export ▾
                                </button>
                                <div className="absolute right-0 top-full mt-1 glass-card bg-[#0A0A0B]/95 border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[160px]">
                                    <button
                                        onClick={() => { downloadMarkdown(fileName, fileLanguage, content); }}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 border-white/10/10 flex items-center gap-2"
                                    >
                                        📝 Markdown (.md)
                                    </button>
                                    <button
                                        onClick={() => { exportHTML(fileName, fileLanguage, content); }}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 border-white/10/10 flex items-center gap-2"
                                    >
                                        🌐 HTML (.html)
                                    </button>
                                    <button
                                        onClick={() => { exportAsciiDoc(fileName, fileLanguage, content); }}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 border-white/10/10 flex items-center gap-2"
                                    >
                                        <span className="text-amber-500 text-xs font-bold border border-amber-500/30 bg-amber-500/10 px-1 rounded">PRO</span>
                                        📄 AsciiDoc (.adoc)
                                    </button>
                                    <button
                                        onClick={() => { exportRST(fileName, fileLanguage, content); }}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 border-white/10/10 flex items-center gap-2"
                                    >
                                        <span className="text-amber-500 text-xs font-bold border border-amber-500/30 bg-amber-500/10 px-1 rounded">PRO</span>
                                        📄 reStructuredText (.rst)
                                    </button>
                                    <button
                                        onClick={async () => { const s = await copyDocToClipboard(fileName, fileLanguage, content); if (s) toast("Copied to clipboard!", "success"); }}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 border-white/10/10 flex items-center gap-2"
                                    >
                                        📋 Copy to Clipboard
                                    </button>
                                    <button
                                        onClick={() => handleOpenGithubModal()}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/5 border-white/10/10 border-t border-white/10 flex items-center gap-2"
                                    >
                                        <Github className="w-4 h-4" /> Push to GitHub
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {isEditing ? (
                        <>
                            <button
                                onClick={() => { setContent(initialContent); setIsEditing(false); }}
                                disabled={isSaving}
                                className="px-3 py-2 text-sm font-medium text-white/70 bg-white/5 border-white/10/10 hover:bg-white/5 border-white/10/20 rounded-lg flex items-center gap-2"
                            >
                                <X className="w-4 h-4" /> Cancel
                            </button>
                            <button
                                onClick={() => handleSaveDoc(content, () => { setIsEditing(false); router.refresh(); })}
                                disabled={isSaving}
                                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2"
                            >
                                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => {
                                if (isLocked) {
                                    toast("This documentation is APPROVED and locked by team policy. Only administrators can modify it.", "error");
                                    return;
                                }
                                setIsEditing(true);
                            }}
                            className={cn(
                                "px-3 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 transition-all",
                                isLocked 
                                    ? "bg-amber-500/10 border-amber-500/20 text-amber-500/50 cursor-not-allowed" 
                                    : "text-white/70 bg-white/5 border-white/10/5 border-white/10 hover:bg-white/5 border-white/10/10"
                            )}
                        >
                            {isLocked ? <Lock className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                            {isLocked ? "Locked" : "Edit Docs"}
                        </button>
                    )}
                </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                    <ProjectViewSwitcher mode={mode} isPro={isPro} onChange={handleModeChange} />
                </div>
            </div>

            {/* Drift Awareness Banner */}
            {content.status === "DRAFT" && content.hasProposedChanges && (
                <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between group animate-in slide-in-from-top duration-500">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                            <Zap className="w-5 h-5 text-amber-500 animate-pulse" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-tight">AI-Drafted Resolution Available</h4>
                            <p className="text-xs text-amber-200/60 font-medium">
                                Code drift detected {content.proposedAt ? `on ${new Date(content.proposedAt).toLocaleDateString()}` : "recently"}. 
                                AI has prepared an updated version.
                            </p>
                        </div>
                    </div>
                    <button 
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/10"
                        onClick={() => {
                            // Trigger the suggest review modal (it's in the subcomponent)
                            // For simplicity, we can just scroll to the suggestions
                            document.getElementById('smart-suggestions')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                    >
                        Review & Apply
                    </button>
                </div>
            )}

            {/* Content */}
            {
                mode === "code" ? (
                    <div className="mt-8 animate-in fade-in duration-300">
                        <div className="flex gap-4 h-[600px]">
                            {/* Code Editor */}
                            <div className="flex-1 bg-[#1e1e1e] border border-white/10 rounded-lg overflow-hidden flex flex-col">
                                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-white/10/5 border-b border-white/5 shrink-0">
                                    <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
                                    <div className="flex items-center gap-4">
                                        {loadingRaw && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mr-2">Editable</span>
                                            <Button 
                                                size="sm" 
                                                onClick={handleSaveCode}
                                                disabled={isSavingCode || loadingRaw}
                                                className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-widest gap-1.5 rounded-lg"
                                            >
                                                {isSavingCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                Commit Code
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                {loadingRaw ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-white/20" />
                                    </div>
                                ) : (
                                    <textarea
                                        value={rawContent || ""}
                                        onChange={(e) => setRawContent(e.target.value)}
                                        className="w-full flex-1 p-4 bg-[#0A0A0B] text-blue-100 font-mono text-sm focus:outline-none resize-none leading-relaxed custom-scrollbar selection:bg-primary/30"
                                        spellCheck={false}
                                    />
                                )}
                            </div>

                            {/* AI Assistant Panel */}
                            <div className="w-[350px] bg-[#1e1e1e] border border-white/10 rounded-lg flex flex-col overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 bg-white/5 border-white/10/5 flex items-center gap-2 shrink-0">
                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                    <span className="text-sm font-medium text-white">AI Architect</span>
                                </div>
                                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
                                    {chatHistory.length === 0 && (
                                        <div className="bg-white/5 border-white/10/5 p-3 rounded-lg border border-white/5">
                                            <p className="text-xs text-white/70 leading-relaxed">
                                                I'm ready to help you refactor <strong>{fileName}</strong>.
                                                I can analyze the code structure, suggest security fixes, or implement new patterns.
                                            </p>
                                        </div>
                                    )}

                                    {chatHistory.map((msg, i) => (
                                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div className={`max-w-[90%] rounded-lg p-3 text-xs ${msg.role === 'user'
                                                ? 'bg-purple-500/20 text-purple-100 border border-purple-500/30'
                                                : 'bg-white/5 border-white/10/5 text-white/90 border border-white/10'
                                                }`}>
                                                {msg.role === 'assistant' ? (
                                                    msg.content.split(/(<thinking>[\s\S]*?<\/thinking>)/g).map((part, j) => {
                                                        if (part.startsWith('<thinking>')) {
                                                            return (
                                                                <div key={j} className="mb-2 p-2 bg-yellow-500/5 border-l-2 border-yellow-500/30 text-yellow-500/70 text-[10px] italic font-mono">
                                                                    {part.replace(/<\/?thinking>/g, '').trim()}
                                                                </div>
                                                            );
                                                        }
                                                        if (!part.trim()) return null;
                                                        return <div key={j} className="whitespace-pre-wrap">{part.trim()}</div>
                                                    })
                                                ) : (
                                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {sendingChat && (
                                        <div className="flex items-start">
                                            <div className="bg-white/5 border-white/10/5 rounded-lg p-3 border border-white/10">
                                                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="p-3 border-t border-white/5 bg-white/5 border-white/10/[0.02]">
                                    <div className="relative">
                                        <textarea
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendChat();
                                                }
                                            }}
                                            disabled={sendingChat}
                                            placeholder="Ask to refactor or explain (e.g. 'Optimize this loop')..."
                                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-xs text-white focus:ring-1 focus:ring-purple-500 outline-none resize-none h-20 placeholder-white/20"
                                        />
                                        <button
                                            onClick={handleSendChat}
                                            disabled={!chatInput.trim() || sendingChat}
                                            className="absolute bottom-2 right-2 p-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white transition-colors"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : mode === "archaeology" ? (
                    <div className="mt-8">
                        <CodeArchaeology fileId={fileId} fileName={fileName} />
                    </div>
                ) : mode === "history" ? (
                    <div className="mt-8 max-w-2xl mx-auto">
                        <VersionHistory
                            fileId={fileId}
                            onRollback={(newContent) => {
                                setContent(newContent);
                                handleModeChange("docs");
                            }}
                        />
                    </div>
                ) : mode === "deep-audit" ? (
                    <div className="mt-8 animate-in fade-in duration-300">
                        {isPro ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-6">
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                            <ShieldCheck className="w-5 h-5 text-green-400" />
                                            Security Hardening
                                        </h3>
                                        <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                                            {content.securityInsights && content.securityInsights.length > 0 ? (
                                                content.securityInsights.map((insight, i) => (
                                                    <div key={i} className="bg-black/20 rounded-lg p-4 border border-white/5">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-semibold text-zinc-100">Security Insight</span>
                                                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                                                                {insight.toLowerCase().includes('critical') ? 'CRITICAL' : 'NOTICE'}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-zinc-400">{insight}</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500">
                                                    <ShieldCheck className="w-12 h-12 mb-3 text-zinc-700" />
                                                    <p>No specific security risks detected.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                            <Activity className="w-5 h-5 text-purple-400" />
                                            Quality & Stats
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4 mb-6">
                                            <div className="p-4 bg-black/20 rounded-lg border border-white/5 text-center">
                                                <div className="text-3xl font-bold text-white mb-1">{content.qualityScore || "N/A"}</div>
                                                <div className="text-xs text-zinc-500 uppercase tracking-widest">Quality Score</div>
                                            </div>
                                            <div className="p-4 bg-black/20 rounded-lg border border-white/5 text-center">
                                                <div className="text-3xl font-bold text-white mb-1">{content.metadata?.linesOfCode || "0"}</div>
                                                <div className="text-xs text-zinc-500 uppercase tracking-widest">Lines of Code</div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {content.metadata?.functions !== undefined && (
                                                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                                                    <span className="text-sm text-zinc-400">Functions Detected</span>
                                                    <span className="text-white font-mono">{content.metadata.functions}</span>
                                                </div>
                                            )}
                                            {content.metadata?.classes !== undefined && (
                                                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                                                    <span className="text-sm text-zinc-400">Classes Detected</span>
                                                    <span className="text-white font-mono">{content.metadata.classes}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-6 min-h-[400px] flex flex-col">
                                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                            <GitBranch className="w-5 h-5 text-blue-400" />
                                            Code Structure
                                        </h3>
                                        <div className="flex-grow bg-black/20 rounded-lg border border-white/5 relative overflow-hidden flex items-center justify-center p-4">
                                            {diagramCode ? (
                                                <div className="w-full h-full overflow-auto">
                                                    <DiagramViewer code={diagramCode} type={diagramType} />
                                                </div>
                                            ) : (
                                                <div className="text-center">
                                                    <Workflow className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                                                    <p className="text-zinc-500 mb-4 text-sm">Visualize class relationships and flow.</p>
                                                    <button
                                                        onClick={handleGenerateDiagram}
                                                        disabled={generatingDiagram}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 mx-auto"
                                                    >
                                                        {generatingDiagram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                        Generate Graph
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="relative rounded-2xl overflow-hidden border border-white/10 h-[600px] bg-[#0A0A0B]">
                                {/* Blurred Background Content */}
                                <div className="absolute inset-0 p-8 blur-sm pointer-events-none opacity-30 select-none">
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="h-8 w-1/3 bg-white/10 rounded"></div>
                                            <div className="h-32 w-full bg-white/5 rounded border border-white/5"></div>
                                            <div className="h-32 w-full bg-white/5 rounded border border-white/5"></div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="h-64 w-full bg-white/5 rounded border border-white/5"></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Locked Overlay */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 bg-gradient-to-b from-transparent to-black/80">
                                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-2xl shadow-orange-500/20 mb-8 animate-in zoom-in duration-500">
                                        <Lock className="w-10 h-10 text-white" />
                                    </div>
                                    <h3 className="text-3xl font-black text-white mb-4 tracking-tight">
                                        Unlock Deep Analysis
                                    </h3>
                                    <p className="text-muted-foreground text-lg max-w-md mb-8 leading-relaxed">
                                        Get advanced security insights, architectural diagrams, and performance profiling.
                                    </p>
                                    <div className="flex flex-col gap-3 w-full max-w-sm">
                                        <button
                                            onClick={() => router.push("/dashboard/billing")}
                                            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-lg shadow-lg hover:shadow-orange-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            Upgrade to Pro
                                        </button>
                                        <button
                                            onClick={() => handleModeChange("docs")}
                                            className="text-sm text-zinc-500 hover:text-white transition-colors"
                                        >
                                            Maybe later
                                        </button>
                                    </div>
                                    <div className="mt-8 flex items-center gap-6 text-xs text-white/30 font-medium">
                                        <span className="flex items-center gap-2"><Check className="w-3 h-3 text-green-500" /> Security Audit</span>
                                        <span className="flex items-center gap-2"><Check className="w-3 h-3 text-green-500" /> Dependency Graph</span>
                                        <span className="flex items-center gap-2"><Check className="w-3 h-3 text-green-500" /> Complexity Score</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* File Summary */}
                        <section>
                            <h3 className="text-lg font-semibold text-white mb-2">Summary</h3>
                            {isEditing ? (
                                <textarea
                                    value={content.summary}
                                    onChange={(e) => setContent({ ...content, summary: e.target.value })}
                                    className="w-full h-32 p-4 text-sm bg-black/20 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-white placeholder-white/30"
                                    placeholder="File summary..."
                                />
                            ) : (
                                <div className="bg-blue-500/10 p-4 rounded-lg text-blue-100 text-sm leading-relaxed border border-blue-500/20 whitespace-pre-wrap">
                                    {content.summary}
                                </div>
                            )}
                        </section>

                        {/* Security Insights */}
                        {content.securityInsights && content.securityInsights.length > 0 && (
                            <section>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                                    🛡️ Security Insights
                                </h3>
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 space-y-2">
                                    {content.securityInsights.map((insight, i) => (
                                        <div key={i} className="text-sm text-amber-200">
                                            {insight}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Detailed Analysis */}
                        {content.entities && content.entities.length > 0 && (
                            <section>
                                <h3 className="text-lg font-semibold text-white mb-4">Detailed Analysis</h3>
                                <div className="space-y-6">
                                    {content.entities.map((entity, i) => (
                                        <div key={i} className={`border rounded-lg overflow-hidden ${entity.type === 'complex_logic' ? 'border-amber-500/30' : 'border-white/10'}`}>
                                            <div className={`px-4 py-2 border-b flex justify-between items-center ${entity.type === 'complex_logic' ? 'bg-amber-500/10' : 'bg-white/5 border-white/10/5'} border-white/5`}>
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-mono text-sm font-bold ${entity.type === 'complex_logic' ? 'text-amber-300' : 'text-blue-400'}`}>{entity.name}</span>
                                                    <span className="text-xs px-2 py-0.5 bg-white/5 border-white/10/5 border border-white/10 rounded text-white/50 uppercase">{entity.type.replace('_', ' ')}</span>
                                                </div>
                                                {!isEditing && (
                                                    <button
                                                        onClick={() => handleRegenerateEntity(i, entity, fileLanguage, (doc) => updateEntityDoc(i, doc))}
                                                        disabled={regeneratingEntity === i}
                                                        className="text-xs px-2 py-1 text-purple-600 hover:bg-purple-100 rounded flex items-center gap-1 disabled:opacity-50"
                                                        title="Regenerate this documentation"
                                                    >
                                                        {regeneratingEntity === i ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="w-3 h-3" />
                                                        )}
                                                        {regeneratingEntity === i ? "..." : "Regen"}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="p-4 bg-transparent text-white/80 text-sm">
                                                {isEditing ? (
                                                    <textarea
                                                        value={entity.doc}
                                                        onChange={(e) => updateEntityDoc(i, e.target.value)}
                                                        className="w-full h-24 p-3 text-sm bg-black/20 border border-white/10 rounded focus:ring-2 focus:ring-blue-500 outline-none resize-y text-white"
                                                    />
                                                ) : (
                                                    <pre className="whitespace-pre-wrap font-sans">{entity.doc}</pre>
                                                )}
                                            </div>
                                            <div className="bg-[#0A0A0B] text-white/30 p-3 text-xs font-mono overflow-x-auto border-t border-white/5">
                                                <div className="flex justify-between items-center mb-1 opacity-50 text-[10px]">
                                                    <span>Line {entity.startLine}-{entity.endLine}</span>
                                                </div>
                                                {entity.code}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )
            }
            {/* Persona Modal */}
            {
                showPersonaModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white/5 border-white/10 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                            <div className="p-6 border-b flex justify-between items-center">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-600" />
                                    Explain as...
                                </h3>
                                <button onClick={() => setShowPersonaModal(false)} className="text-gray-400 hover:text-zinc-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-grow">
                                {!personaExplanation ? (
                                    <div className="space-y-6">
                                        <p className="text-zinc-400">Choose a persona to explain this code:</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {[
                                                { id: 'junior', label: 'Junior Developer', desc: 'Simple, educational, analogies' },
                                                { id: 'senior', label: 'Senior Engineer', desc: 'Concise, architectural, trade-offs' },
                                                { id: 'nontechnical', label: 'Product Manager', desc: 'Business value, high-level' }
                                            ].map(p => (
                                                <button
                                                    key={p.id}
                                                    // @ts-ignore
                                                    onClick={() => handlePersonaExplain(p.id)}
                                                    disabled={personaLoading}
                                                    className="p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-500/10 text-left transition-all group"
                                                >
                                                    <div className="font-semibold text-zinc-100 group-hover:text-blue-700">{p.label}</div>
                                                    <div className="text-xs text-gray-500 mt-1">{p.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                        {personaLoading && (
                                            <div className="flex items-center justify-center py-8 text-blue-600 gap-2">
                                                <Loader2 className="w-6 h-6 animate-spin" />
                                                <span>Generating explanation...</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 font-medium inline-block">
                                            Explained for: <span className="uppercase">{personaExplanation.persona}</span>
                                        </div>
                                        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                                            {personaExplanation.text}
                                        </div>
                                        <button
                                            onClick={() => setPersonaExplanation(null)}
                                            className="text-sm text-blue-600 hover:underline mt-4"
                                        >
                                            ← Choose another persona
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* GitHub Repo Modal */}
            {
                showGithubModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white/5 border-white/10 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                            <div className="p-6 border-b flex justify-between items-center bg-white/5 rounded-t-xl">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Github className="w-5 h-5" />
                                    Select Repository
                                </h3>
                                <button onClick={() => setShowGithubModal(false)} className="text-gray-400 hover:text-zinc-400">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 overflow-y-auto">
                                <p className="text-sm text-gray-500 mb-4">
                                    Select a repository to create a Pull Request with the generated documentation.
                                </p>
                                {pushingToGithub ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                                        <p className="text-zinc-400 font-medium">Creating Pull Request...</p>
                                        <p className="text-sm text-gray-400">This might take a moment.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {githubRepos.map(repo => (
                                            <button
                                                key={repo.id}
                                                onClick={() => handlePushToGithub(repo.full_name)}
                                                className="w-full text-left p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
                                            >
                                                <div className="font-semibold text-zinc-100 group-hover:text-blue-700">{repo.full_name}</div>
                                                <div className="text-xs text-gray-500 flex gap-4 mt-1">
                                                    <span>{repo.language || "Unknown"}</span>
                                                    <span>{repo.private ? "Private" : "Public"}</span>
                                                    <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showDiagramModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col text-white">
                            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                                    <Workflow className="w-5 h-5 text-pink-500" />
                                    Architecture Diagram
                                </h3>
                                <button onClick={() => setShowDiagramModal(false)} className="text-zinc-500 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto">
                                <div className="flex gap-4 items-center">
                                    <select
                                        value={diagramType}
                                        onChange={(e) => setDiagramType(e.target.value)}
                                        className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                                    >
                                        <option value="class">Class Diagram</option>
                                        <option value="sequence">Sequence Diagram</option>
                                        <option value="flowchart">Flowchart</option>
                                        <option value="state">State Diagram</option>
                                    </select>

                                    <button
                                        onClick={handleGenerateDiagram}
                                        disabled={generatingDiagram}
                                        className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {generatingDiagram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        Generate Diagram
                                    </button>
                                </div>

                                <div className="min-h-[400px] border border-zinc-800 rounded-xl bg-zinc-950/50 relative">
                                    {diagramCode ? (
                                        <div className="p-4">
                                            <DiagramViewer code={diagramCode} type={diagramType} />
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
                                            <Workflow className="w-12 h-12 mb-4 opacity-20" />
                                            {generatingDiagram ? (
                                                <div className="space-y-2">
                                                    <p className="text-lg font-medium text-pink-500 animate-pulse">Analyzing code structure...</p>
                                                    <p className="text-sm">Generating {diagramType} diagram...</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-lg font-medium mb-2">Ready to Visualize</p>
                                                    <p className="text-sm max-w-md">
                                                        Select a diagram type and click Generate to visualize your code's structure, flow, or relationships using AI.
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* Smart Suggestions - Pro Feature */}
            {
                !isEditing && mode === "docs" && (
                    <div className="mt-8" id="smart-suggestions">
                        <DocSuggestions 
                            fileId={fileId} 
                            onUpdate={() => router.refresh()}
                        />
                    </div>
                )
            }

            {/* Comments Section */}
            {
                !isEditing && mode === "docs" && (
                    <CommentsSection fileId={fileId} />
                )
            }

            <GithubModal
                isOpen={showGithubModal}
                onClose={() => setShowGithubModal(false)}
                repos={githubRepos}
                pushingToGithub={pushingToGithub}
                onPush={handlePushToGithub}
            />

            <DiagramModal
                isOpen={showDiagramModal}
                onClose={() => setShowDiagramModal(false)}
                diagramType={diagramType}
                setDiagramType={setDiagramType}
                generatingDiagram={generatingDiagram}
                onGenerate={handleGenerateDiagram}
                diagramCode={diagramCode}
            />
        </div >
    );
}
