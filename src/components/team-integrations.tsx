"use client";

import { useEffect, useState } from "react";
import {
    Loader2,
    CheckCircle2,
    Trash2,
    Plus,
    MessageSquare,
    ShieldCheck,
    Share2,
    Activity,
    Clock,
    Sparkles,
    Save,
    Code2,
    AlertTriangle,
    RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "./toast";
import { cn } from "@/lib/utils";

type WebhookType = "SLACK" | "DISCORD";

interface TeamConfig {
    coverageGoal?: number;
    requireApproval?: boolean;
    lockApproved?: boolean;
    driftAlerts?: boolean;
    autoGithubSync?: boolean;
    githubRepo?: string;
    retentionDays?: number;
    styleGuide?: string;
    apiGuidelines?: string;
}

interface Integration {
    id: string;
    type: string;
    config: unknown;
    isActive: boolean;
    createdAt: string;
}

interface IntegrationsResponse {
    integrations?: Integration[];
    permissions?: {
        canManage?: boolean;
    };
    error?: string;
    message?: string;
}

function getApiMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") {
        return fallback;
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim().length > 0) {
        return record.message;
    }

    if (
        typeof record.error === "string" &&
        record.error.trim().length > 0 &&
        record.error !== "ApiException" &&
        record.error !== "Error"
    ) {
        return record.error;
    }

    return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTeamConfig(integrations: Integration[]): TeamConfig {
    const configIntegration = integrations.find((integration) => integration.type === "TEAM_CONFIG");
    if (!configIntegration || !isRecord(configIntegration.config)) {
        return {};
    }

    const config = configIntegration.config;

    return {
        coverageGoal: typeof config.coverageGoal === "number" ? config.coverageGoal : undefined,
        requireApproval: typeof config.requireApproval === "boolean" ? config.requireApproval : undefined,
        lockApproved: typeof config.lockApproved === "boolean" ? config.lockApproved : undefined,
        driftAlerts: typeof config.driftAlerts === "boolean" ? config.driftAlerts : undefined,
        autoGithubSync: typeof config.autoGithubSync === "boolean" ? config.autoGithubSync : undefined,
        githubRepo: typeof config.githubRepo === "string" ? config.githubRepo : undefined,
        retentionDays: typeof config.retentionDays === "number" ? config.retentionDays : undefined,
        styleGuide: typeof config.styleGuide === "string" ? config.styleGuide : undefined,
        apiGuidelines: typeof config.apiGuidelines === "string" ? config.apiGuidelines : undefined,
    };
}

function extractWebhookUrl(config: unknown): string {
    if (!isRecord(config)) {
        return "Webhook URL unavailable";
    }

    const webhook = config.webhookUrl;
    return typeof webhook === "string" ? webhook : "Webhook URL unavailable";
}

export function TeamIntegrations({ teamId, canManage }: { teamId: string; canManage: boolean }) {
    const { toast } = useToast();

    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [canManageAccess, setCanManageAccess] = useState(canManage);

    const [type, setType] = useState<WebhookType>("SLACK");
    const [webhookUrl, setWebhookUrl] = useState("");

    const [coverageGoal, setCoverageGoal] = useState(80);
    const [requireApproval, setRequireApproval] = useState(false);
    const [lockApproved, setLockApproved] = useState(false);
    const [driftAlerts, setDriftAlerts] = useState(true);
    const [autoGithubSync, setAutoGithubSync] = useState(false);
    const [githubRepo, setGithubRepo] = useState("");
    const [retentionDays, setRetentionDays] = useState(0);
    const [styleGuide, setStyleGuide] = useState("");
    const [apiGuidelines, setApiGuidelines] = useState("");
    const [updatingGoal, setUpdatingGoal] = useState(false);

    const applyTeamConfig = (config: TeamConfig) => {
        if (config.coverageGoal !== undefined) setCoverageGoal(config.coverageGoal);
        if (config.requireApproval !== undefined) setRequireApproval(config.requireApproval);
        if (config.lockApproved !== undefined) setLockApproved(config.lockApproved);
        if (config.driftAlerts !== undefined) setDriftAlerts(config.driftAlerts);
        if (config.autoGithubSync !== undefined) setAutoGithubSync(config.autoGithubSync);
        if (config.githubRepo !== undefined) setGithubRepo(config.githubRepo);
        if (config.retentionDays !== undefined) setRetentionDays(config.retentionDays);
        if (config.styleGuide !== undefined) setStyleGuide(config.styleGuide);
        if (config.apiGuidelines !== undefined) setApiGuidelines(config.apiGuidelines);
    };

    useEffect(() => {
        setCanManageAccess(canManage);
    }, [canManage, teamId]);

    const fetchIntegrations = async (options?: { background?: boolean }) => {
        const background = options?.background ?? false;

        if (!background) {
            setLoading(true);
        }

        setLoadError("");

        try {
            const res = await fetch(`/api/teams/${teamId}/integrations`);
            const data: IntegrationsResponse = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(getApiMessage(data, "Failed to load integrations"));
            }

            const nextIntegrations = Array.isArray(data.integrations) ? data.integrations : [];
            setIntegrations(nextIntegrations);
            if (typeof data.permissions?.canManage === "boolean") {
                setCanManageAccess(data.permissions.canManage);
            }
            applyTeamConfig(extractTeamConfig(nextIntegrations));
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to load integrations";
            setLoadError(message);
            return false;
        } finally {
            if (!background) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        void fetchIntegrations();
    }, [teamId]);

    const buildConfig = (updates: Partial<TeamConfig>): TeamConfig => ({
        coverageGoal: updates.coverageGoal ?? coverageGoal,
        requireApproval: updates.requireApproval ?? requireApproval,
        lockApproved: updates.lockApproved ?? lockApproved,
        driftAlerts: updates.driftAlerts ?? driftAlerts,
        autoGithubSync: updates.autoGithubSync ?? autoGithubSync,
        githubRepo: updates.githubRepo ?? githubRepo,
        retentionDays: updates.retentionDays ?? retentionDays,
        styleGuide: updates.styleGuide ?? styleGuide,
        apiGuidelines: updates.apiGuidelines ?? apiGuidelines,
    });

    const handleRefresh = async () => {
        setRefreshing(true);
        const ok = await fetchIntegrations({ background: true });
        if (!ok) {
            toast("Unable to refresh integrations right now.", "error");
        }
        setRefreshing(false);
    };

    const handleUpdateConfig = async (updates: Partial<TeamConfig>) => {
        if (!canManageAccess) {
            toast("Only team owners or admins can update integration settings.", "error");
            return;
        }

        setUpdatingGoal(true);
        const nextConfig = buildConfig(updates);

        try {
            const res = await fetch(`/api/teams/${teamId}/integrations`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "TEAM_CONFIG",
                    config: nextConfig,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(getApiMessage(data, "Failed to update team configuration"));
            }

            applyTeamConfig(nextConfig);
            toast("Team configuration updated!", "success");
            await fetchIntegrations({ background: true });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Error updating configuration";
            toast(message, "error");
        } finally {
            setUpdatingGoal(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!canManageAccess) {
            toast("Only team owners or admins can add integrations.", "error");
            return;
        }

        if (!webhookUrl.trim()) return;

        setCreating(true);
        try {
            const res = await fetch(`/api/teams/${teamId}/integrations`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type,
                    config: { webhookUrl },
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(getApiMessage(data, "Failed to add integration"));
            }

            setWebhookUrl("");
            await fetchIntegrations({ background: true });
            toast(`${type} integration added!`, "success");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Error adding integration";
            toast(message, "error");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!canManageAccess) {
            toast("Only team owners or admins can remove integrations.", "error");
            return;
        }

        if (!confirm("Are you sure you want to remove this integration?")) return;

        setDeletingId(id);
        try {
            const res = await fetch(`/api/integrations/${id}`, { method: "DELETE" });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(getApiMessage(data, "Failed to remove integration"));
            }

            setIntegrations((prev) => prev.filter((integration) => integration.id !== id));
            toast("Integration removed", "success");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to remove integration";
            toast(message, "error");
        } finally {
            setDeletingId(null);
        }
    };

    const webhookIntegrations = integrations.filter((integration) => integration.type !== "TEAM_CONFIG");

    return (
        <div className="space-y-6">
            {loadError && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {loadError}
                    </span>
                    <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing} className="h-7 gap-1.5">
                        {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Retry
                    </Button>
                </div>
            )}

            {!canManageAccess && (
                <div className="text-xs text-blue-200 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                    You can view integration status, but only team owners/admins can modify policies and webhooks.
                </div>
            )}

            {/* Documentation Target */}
            <div className="p-5 rounded-[1.5rem] bg-emerald-500/5 border border-emerald-500/10 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Team Coverage Target</span>
                    </div>
                    <div className="text-xl font-black text-white italic">{coverageGoal}%</div>
                </div>

                <div className="space-y-4">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={coverageGoal}
                        onChange={(e) => setCoverageGoal(parseInt(e.target.value, 10))}
                        disabled={!canManageAccess}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <Button
                        size="sm"
                        onClick={() => handleUpdateConfig({ coverageGoal })}
                        disabled={updatingGoal || !canManageAccess}
                        className="w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest gap-2"
                    >
                        {updatingGoal ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Set Target Goal
                    </Button>
                </div>
            </div>

            {/* AI Style Guide */}
            <div className="p-5 rounded-[1.5rem] bg-purple-500/5 border border-purple-500/10 space-y-4">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-100">AI Documentation Style Guide</span>
                </div>

                <div className="space-y-4">
                    <textarea
                        value={styleGuide}
                        onChange={(e) => setStyleGuide(e.target.value)}
                        placeholder="e.g. Always use JSDoc format, focus on architectural patterns, and keep descriptions under 100 words."
                        disabled={!canManageAccess}
                        className="w-full h-24 bg-black/40 border border-white/10 text-white text-xs p-3 rounded-xl focus:ring-1 focus:ring-purple-500 outline-none resize-none placeholder:text-zinc-600 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <Button
                        size="sm"
                        onClick={() => handleUpdateConfig({ styleGuide })}
                        disabled={updatingGoal || !canManageAccess}
                        className="w-full h-8 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest gap-2"
                    >
                        {updatingGoal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save Style Guide
                    </Button>
                </div>
            </div>

            {/* API Design Guidelines */}
            <div className="p-5 rounded-[1.5rem] bg-blue-500/5 border border-blue-500/10 space-y-4">
                <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-100">API Design Guidelines</span>
                </div>

                <div className="space-y-4">
                    <textarea
                        value={apiGuidelines}
                        onChange={(e) => setApiGuidelines(e.target.value)}
                        placeholder="e.g. Use camelCase for all JSON keys, enforce RESTful principles, always include versioning in paths."
                        disabled={!canManageAccess}
                        className="w-full h-24 bg-black/40 border border-white/10 text-white text-xs p-3 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none resize-none placeholder:text-zinc-600 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <Button
                        size="sm"
                        onClick={() => handleUpdateConfig({ apiGuidelines })}
                        disabled={updatingGoal || !canManageAccess}
                        className="w-full h-8 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest gap-2"
                    >
                        {updatingGoal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save API Guidelines
                    </Button>
                </div>
            </div>

            {/* Team Policy */}
            <div className="p-5 rounded-[1.5rem] bg-amber-500/5 border border-amber-500/10 space-y-4">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-100">Governance Policy</span>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                        <div>
                            <p className="text-xs font-bold text-white uppercase tracking-tighter">Mandatory Review</p>
                            <p className="text-[10px] text-zinc-500 italic">Docs must be APPROVED by admin before finalized</p>
                        </div>
                        <button
                            onClick={() => handleUpdateConfig({ requireApproval: !requireApproval })}
                            disabled={updatingGoal || !canManageAccess}
                            className={cn(
                                "h-5 w-10 rounded-full relative transition-all duration-300",
                                requireApproval ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-white/10",
                            )}
                        >
                            <div
                                className={cn(
                                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300",
                                    requireApproval ? "right-1" : "left-1",
                                )}
                            />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                        <div>
                            <p className="text-xs font-bold text-white uppercase tracking-tighter">Lock Approved Docs</p>
                            <p className="text-[10px] text-zinc-500 italic">Prevent edits once documentation is APPROVED</p>
                        </div>
                        <button
                            onClick={() => handleUpdateConfig({ lockApproved: !lockApproved })}
                            disabled={updatingGoal || !canManageAccess}
                            className={cn(
                                "h-5 w-10 rounded-full relative transition-all duration-300",
                                lockApproved ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-white/10",
                            )}
                        >
                            <div
                                className={cn(
                                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300",
                                    lockApproved ? "right-1" : "left-1",
                                )}
                            />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                        <div>
                            <p className="text-xs font-bold text-white uppercase tracking-tighter">Documentation Drift Alerts</p>
                            <p className="text-[10px] text-zinc-500 italic">Notify team channels when documentation falls out of sync</p>
                        </div>
                        <button
                            onClick={() => handleUpdateConfig({ driftAlerts: !driftAlerts })}
                            disabled={updatingGoal || !canManageAccess}
                            className={cn(
                                "h-5 w-10 rounded-full relative transition-all duration-300",
                                driftAlerts ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "bg-white/10",
                            )}
                        >
                            <div
                                className={cn(
                                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300",
                                    driftAlerts ? "right-1" : "left-1",
                                )}
                            />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                        <div className="flex-1 mr-4">
                            <p className="text-xs font-bold text-white uppercase tracking-tighter">Auto-Sync to GitHub</p>
                            <p className="text-[10px] text-zinc-500 italic">Create a Pull Request automatically when documentation is APPROVED</p>
                            {autoGithubSync && (
                                <Input
                                    placeholder="owner/repo (e.g. acme/web-app)"
                                    value={githubRepo}
                                    onChange={(e) => setGithubRepo(e.target.value)}
                                    onBlur={() => handleUpdateConfig({ githubRepo })}
                                    disabled={!canManageAccess}
                                    className="mt-2 bg-black/40 border-white/10 text-white text-[10px] h-7 rounded-lg font-mono disabled:opacity-60"
                                />
                            )}
                        </div>
                        <button
                            onClick={() => handleUpdateConfig({ autoGithubSync: !autoGithubSync })}
                            disabled={updatingGoal || !canManageAccess}
                            className={cn(
                                "h-5 w-10 rounded-full relative transition-all duration-300",
                                autoGithubSync ? "bg-primary shadow-[0_0_10px_rgba(124,58,237,0.4)]" : "bg-white/10",
                            )}
                        >
                            <div
                                className={cn(
                                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300",
                                    autoGithubSync ? "right-1" : "left-1",
                                )}
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* Documentation Retention */}
            <div className="p-5 rounded-[1.5rem] bg-rose-500/5 border border-rose-500/10 space-y-4">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-100">Retention Policy</span>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                        <div className="flex-1 mr-4">
                            <p className="text-xs font-bold text-white uppercase tracking-tighter">Verification Window</p>
                            <p className="text-[10px] text-zinc-500 italic">Demote to DRAFT if not verified within this many days (0 to disable)</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min="0"
                                max="365"
                                value={retentionDays}
                                onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 0)}
                                disabled={!canManageAccess}
                                className="w-16 h-8 bg-black/40 border-white/10 text-white text-xs text-center font-bold rounded-lg disabled:opacity-60"
                            />
                            <Button
                                size="sm"
                                onClick={() => handleUpdateConfig({ retentionDays })}
                                disabled={updatingGoal || !canManageAccess}
                                className="h-8 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest"
                            >
                                Set
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Integration */}
            <div className="p-5 rounded-[1.5rem] bg-indigo-500/5 border border-indigo-500/10 space-y-4">
                <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-indigo-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Add Team Webhook</span>
                </div>

                <form onSubmit={handleCreate} className="space-y-3">
                    <div className="flex gap-2">
                        <select
                            value={type}
                            onChange={(e) => {
                                const nextValue = e.target.value;
                                if (nextValue === "SLACK" || nextValue === "DISCORD") {
                                    setType(nextValue);
                                }
                            }}
                            disabled={!canManageAccess}
                            className="bg-[#18181b] border border-white/10 text-white rounded-xl px-3 text-xs font-bold outline-none h-10 min-w-[100px] disabled:opacity-60"
                        >
                            <option value="SLACK">Slack</option>
                            <option value="DISCORD">Discord</option>
                        </select>
                        <Input
                            placeholder={type === "SLACK" ? "https://hooks.slack.com/services/..." : "https://discord.com/api/webhooks/..."}
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            disabled={!canManageAccess}
                            className="bg-black/40 border-white/10 text-white h-10 text-xs rounded-xl flex-1 font-mono disabled:opacity-60"
                        />
                    </div>
                    <Button
                        disabled={creating || !webhookUrl.trim() || !canManageAccess}
                        className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 shadow-lg shadow-indigo-500/10"
                    >
                        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Connect Webhook
                    </Button>
                </form>
            </div>

            {/* List Integrations */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Active Integrations</label>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={handleRefresh} disabled={refreshing}>
                        {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Refresh
                    </Button>
                </div>

                {loading ? (
                    <div className="py-4 flex justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-700" />
                    </div>
                ) : webhookIntegrations.length === 0 ? (
                    <p className="text-[11px] text-zinc-600 italic px-1">No team integrations configured.</p>
                ) : (
                    <div className="grid gap-2">
                        {webhookIntegrations.map((integration) => (
                            <div key={integration.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-all">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center border",
                                            integration.type === "SLACK"
                                                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                                : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
                                        )}
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-white uppercase tracking-tighter">{integration.type} CHANNEL</p>
                                        <p className="text-[10px] text-zinc-500 font-mono truncate max-w-[200px]">{extractWebhookUrl(integration.config)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                        <span className="text-[9px] font-black text-emerald-500 uppercase">Active</span>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(integration.id)}
                                        disabled={deletingId === integration.id || !canManageAccess}
                                        className="p-1.5 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-60"
                                    >
                                        {deletingId === integration.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
