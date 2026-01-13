"use client";

import { useState, useEffect } from "react";
import { Github, FolderGit2, Loader2, Check, AlertCircle, Lock, Globe, ChevronRight, Search, Zap, ArrowUpRight } from "lucide-react";
import { PRAnalysisView } from "./pr-analysis-view";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface Repo {
    id: number;
    name: string;
    full_name: string;
    language: string;
    updated_at: string;
    private: boolean;
    description?: string;
}

interface PullRequest {
    number: number;
    title: string;
    user: { login: string };
    created_at: string;
}

import { useToast } from "./toast";

export default function GitHubImport() {
    const { toast } = useToast();
    const [repos, setRepos] = useState<Repo[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState<string | null>(null);
    const [imported, setImported] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showRepos, setShowRepos] = useState(false);

    // PR Analysis State
    const [activeRepo, setActiveRepo] = useState<Repo | null>(null);
    const [pulls, setPulls] = useState<PullRequest[]>([]);
    const [fetchingPulls, setFetchingPulls] = useState(false);
    const [analyzingPR, setAnalyzingPR] = useState<number | null>(null);
    const [prAnalysis, setPrAnalysis] = useState<{ [key: number]: any }>({});

    const fetchRepos = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/github/repos");
            const data = await res.json();
            if (data.repos) {
                setRepos(data.repos);
                setShowRepos(true);
            } else {
                setError("Failed to load repositories");
            }
        } catch {
            setError("Failed to connect to GitHub");
        } finally {
            setLoading(false);
        }
    };

    const fetchPRs = async (repo: Repo) => {
        setActiveRepo(repo);
        setFetchingPulls(true);
        try {
            const [owner, name] = repo.full_name.split("/");
            const res = await fetch(`/api/github/repos/pulls?owner=${owner}&repo=${name}`);
            if (res.ok) {
                const data = await res.json();
                setPulls(data.pulls.slice(0, 5));
            }
        } catch (e) {
            console.error("Failed to fetch PRs:", e);
        } finally {
            setFetchingPulls(false);
        }
    };

    const handleAnalyzePR = async (pullNumber: number) => {
        if (!activeRepo) return;
        setAnalyzingPR(pullNumber);
        try {
            const [owner, repoName] = activeRepo.full_name.split("/");
            const res = await fetch("/api/github/pr/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner, repo: repoName, pullNumber }),
            });

            if (res.ok) {
                const data = await res.json();
                setPrAnalysis(prev => ({ ...prev, [pullNumber]: data.analysis }));
                toast("AI Analysis Complete", "success");
            }
        } catch {
            toast("Failed to analyze PR", "error");
        } finally {
            setAnalyzingPR(null);
        }
    };

    const handleImport = async (repo: Repo) => {
        setImporting(repo.full_name);
        try {
            const [owner, repoName] = repo.full_name.split("/");
            const res = await fetch("/api/github/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner, repo: repoName }),
            });

            if (res.ok) {
                const data = await res.json();
                setImported(prev => [...prev, repo.full_name]);

                const issueCount = data.results.reduce((acc: number, r: any) => acc + (r.securityInsights?.length || 0), 0);
                const violationCount = data.results.reduce((acc: number, r: any) => acc + (r.architectureViolations?.length || 0), 0);

                if (issueCount > 0 || violationCount > 0) {
                    toast(`Imported ${data.imported} files. Detected ${issueCount} security issues & ${violationCount} violations.`, "error");
                } else {
                    toast(`Imported ${data.imported} files successfully!`, "success");
                }
            } else {
                const data = await res.json();
                toast(data.error || "Import failed", "error");
            }
        } catch {
            toast("Failed to import repository", "error");
        } finally {
            setImporting(null);
        }
    };

    const filteredRepos = repos.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getLanguageColor = (lang: string) => {
        const colors: Record<string, string> = {
            TypeScript: "bg-blue-400",
            JavaScript: "bg-yellow-400",
            Python: "bg-green-400",
            Go: "bg-cyan-400",
            Rust: "bg-orange-400",
            Java: "bg-red-400",
        };
        return colors[lang] || "bg-zinc-500";
    };

    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ name: "", description: "", isPrivate: false });
    const [creating, setCreating] = useState(false);

    const handleCreateRepo = async () => {
        if (!createForm.name) return;
        setCreating(true);
        try {
            const res = await fetch("/api/github/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(createForm),
            });
            const data = await res.json();
            if (res.ok) {
                toast(`Repository ${data.repo.name} created!`, "success");
                setCreateForm({ name: "", description: "", isPrivate: false });
                setShowCreate(false);
                fetchRepos(); // Refresh list
            } else {
                toast(data.error || "Failed to create repository", "error");
            }
        } catch {
            toast("Failed to create repository", "error");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="w-full">
            {!showRepos ? (
                <Button
                    onClick={fetchRepos}
                    disabled={loading}
                    variant="ghost"
                    className="w-full h-11 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest transition-all"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                        <Github className="w-4 h-4 mr-2" />
                    )}
                    {loading ? "Connecting..." : "Import Repo"}
                </Button>
            ) : (
                <div className="glass-card bg-black/60 border border-white/10 rounded-2xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
                    <div className="flex items-center justify-between pb-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center">
                                <Github className="w-3.5 h-3.5 text-white" />
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/70">
                                {activeRepo ? "Select PR" : showCreate ? "Create Repo" : "GitHub Repos"}
                            </h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {!activeRepo && !showCreate && (
                                <button
                                    onClick={() => setShowCreate(true)}
                                    className="text-[10px] uppercase font-bold text-primary hover:text-primary/80 transition-colors mr-2"
                                >
                                    + New
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (activeRepo) setActiveRepo(null);
                                    else if (showCreate) setShowCreate(false);
                                    else setShowRepos(false);
                                }}
                                className="text-[10px] uppercase font-bold text-white/40 hover:text-white transition-colors"
                            >
                                {activeRepo || showCreate ? "Back" : "Close"}
                            </button>
                        </div>
                    </div>

                    {showCreate ? (
                        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Repository Name</label>
                                <input
                                    type="text"
                                    value={createForm.name}
                                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                                    placeholder="my-awesome-project"
                                    className="w-full bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Description</label>
                                <textarea
                                    value={createForm.description}
                                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                                    placeholder="What's this project about?"
                                    rows={3}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all resize-none"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="private-repo"
                                    checked={createForm.isPrivate}
                                    onChange={(e) => setCreateForm({ ...createForm, isPrivate: e.target.checked })}
                                    className="rounded bg-black/40 border-white/10 text-primary focus:ring-primary/50"
                                />
                                <label htmlFor="private-repo" className="text-[11px] text-white cursor-pointer select-none">Private Repository</label>
                                <Lock className="w-3 h-3 text-amber-500/50" />
                            </div>
                            <Button
                                onClick={handleCreateRepo}
                                disabled={creating || !createForm.name}
                                className="w-full h-10 bg-primary hover:bg-primary-dark text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                            >
                                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create Repository"}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {!activeRepo && (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search repos..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-black/40 border border-white/5 rounded-xl py-2 pl-8 pr-3 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/50"
                                    />
                                </div>
                            )}

                            {error && (
                                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-400 flex items-center gap-2">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    {error}
                                </div>
                            )}

                            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {!activeRepo ? (
                                    filteredRepos.map(repo => (
                                        <div
                                            key={repo.id}
                                            className="flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all group"
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                                                    <FolderGit2 className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                                                </div>
                                                <div className="overflow-hidden space-y-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold text-[11px] text-white truncate max-w-[120px]">{repo.name}</span>
                                                        {repo.private ? (
                                                            <Lock className="w-2.5 h-2.5 text-amber-500/50" />
                                                        ) : null}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-medium">
                                                        {repo.language && (
                                                            <span className="flex items-center gap-1">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${getLanguageColor(repo.language)}`} />
                                                                {repo.language}
                                                            </span>
                                                        )}
                                                        <span>•</span>
                                                        <span>{new Date(repo.updated_at).getFullYear()}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => fetchPRs(repo)}
                                                    className="p-1.5 text-muted-foreground hover:text-white hover:bg-white/5 rounded-lg transition-all"
                                                    title="View Pull Requests"
                                                >
                                                    <Zap className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleImport(repo)}
                                                    disabled={importing === repo.full_name || imported.includes(repo.full_name)}
                                                    className={`p-1.5 rounded-lg transition-all ${imported.includes(repo.full_name)
                                                        ? "text-emerald-400 bg-emerald-400/10"
                                                        : "text-white/60 bg-white/5 hover:bg-primary/20 hover:text-primary disabled:opacity-30"
                                                        }`}
                                                >
                                                    {importing === repo.full_name ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : imported.includes(repo.full_name) ? (
                                                        <Check className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <ArrowUpRight className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="space-y-3">
                                        {fetchingPulls ? (
                                            <div className="flex items-center justify-center py-6">
                                                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                            </div>
                                        ) : pulls.length === 0 ? (
                                            <div className="text-center py-6 text-xs text-muted-foreground bg-white/5 rounded-xl border border-dashed border-white/10">
                                                No active pull requests.
                                            </div>
                                        ) : (
                                            pulls.map(pull => (
                                                <div key={pull.number} className="bg-black/40 border border-white/5 rounded-2xl overflow-hidden shadow-inner translate-y-0 hover:-translate-y-0.5 transition-all">
                                                    <div className="p-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                                        <div className="overflow-hidden">
                                                            <div className="text-[11px] font-bold text-white truncate group-hover:text-primary transition-colors">
                                                                #{pull.number} {pull.title}
                                                            </div>
                                                            <div className="text-[9px] text-muted-foreground mt-0.5">
                                                                {pull.user.login} • {new Date(pull.created_at).toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleAnalyzePR(pull.number)}
                                                            disabled={analyzingPR === pull.number}
                                                            className="shrink-0 px-2.5 py-1.5 bg-primary/20 text-primary text-[10px] font-black uppercase tracking-tight rounded-lg hover:bg-primary/30 disabled:opacity-50 transition-all border border-primary/20"
                                                        >
                                                            {analyzingPR === pull.number ? <Loader2 className="w-3 h-3 animate-spin" /> : "Analyze"}
                                                        </button>
                                                    </div>
                                                    {prAnalysis[pull.number] && (
                                                        <div className="p-0 animate-in slide-in-from-top-2 duration-300">
                                                            <PRAnalysisView data={prAnalysis[pull.number]} />
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {!activeRepo && filteredRepos.length === 0 && searchQuery && (
                                <div className="text-center py-8 text-xs text-muted-foreground italic">
                                    No repositories found for "{searchQuery}"
                                </div>
                            )}

                            {!activeRepo && (
                                <p className="text-[9px] font-bold text-muted-foreground/30 text-center uppercase tracking-tighter">
                                    DocuMint • Secure GitHub Bridge • v2.0
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

