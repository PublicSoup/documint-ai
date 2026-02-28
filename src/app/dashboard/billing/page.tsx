"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
    CreditCard, Zap, CheckCircle2, Loader2, BarChart3, Crown,
    User, Key, Bell, Trash2, Check, Copy, Blocks, Github,
    Users, Shield, Layout, ArrowRight, FileText, History, Settings
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useToast } from "@/components/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import InvoiceHistory from "@/components/invoice-history";
import AuditLogViewer from "@/components/audit-log-viewer";
import { TemplateManager } from "@/components/template-manager";
import { cn } from "@/lib/utils";
import { PLANS } from "@/config/plans";

interface UsageData {
    filesProcessed: number;
    filesLimit: number;
    plan: string;
    planId: string;
    validUntil: string;
    isDevMode?: boolean;
}

interface TeamSummary {
    id: string;
    name: string;
    role: string;
}

interface TeamMember {
    id: string;
    userId: string;
    role: string;
    user?: {
        name?: string | null;
        email?: string | null;
    } | null;
}

export default function BillingHub() {
    const { toast } = useToast();
    const { data: session } = useSession();

    // Core State
    const [activeTab, setActiveTab] = useState<"plans" | "profile" | "teams" | "api" | "notifications" | "integrations" | "audit" | "templates">("plans");
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [upgrading, setUpgrading] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const [billingLoading, setBillingLoading] = useState(false);
    const [focusedPlanId, setFocusedPlanId] = useState<"starter" | "pro" | "team" | null>(null);
    const [trialIntentActive, setTrialIntentActive] = useState(false);
    const [checkoutCanceled, setCheckoutCanceled] = useState(false);

    // Profile State
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // API Key State
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [generatingKey, setGeneratingKey] = useState(false);
    const [copied, setCopied] = useState(false);

    // Team State
    const [teams, setTeams] = useState<TeamSummary[]>([]);
    const [loadingTeams, setLoadingTeams] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [invitingTeamId, setInvitingTeamId] = useState<string | null>(null);
    const [sendingInvite, setSendingInvite] = useState(false);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [removingMember, setRemovingMember] = useState<string | null>(null);

    useEffect(() => {
        setIsMounted(true);
        fetchUsage();

        const params = new URLSearchParams(window.location.search);
        const plan = params.get("plan");
        const intent = params.get("intent");
        const canceled = params.get("canceled");

        if (intent === "trial") {
            setTrialIntentActive(true);
            setActiveTab("plans");
        }

        if (canceled === "true") {
            setCheckoutCanceled(true);
            setActiveTab("plans");
        }

        if (plan === "starter" || plan === "pro" || plan === "team") {
            setFocusedPlanId(plan);
            setActiveTab("plans");
        }
    }, []);

    useEffect(() => {
        if (activeTab === "teams") {
            fetchTeams();
        }
    }, [activeTab]);

    const fetchUsage = async () => {
        try {
            const res = await fetch("/api/usage");
            if (res.ok) {
                const data = await res.json();
                setUsage(data);
            }
        } catch (error) {
            console.error("Failed to fetch usage:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpgrade = async (tier: string) => {
        setUpgrading(tier);
        try {
            const checkoutSource = trialIntentActive
                ? focusedPlanId === tier
                    ? "billing_trial_banner"
                    : "billing_trial_plan_grid"
                : "billing_plan_grid";

            const res = await fetch(`/api/checkout?tier=${tier}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source: checkoutSource,
                    intent: trialIntentActive ? "trial" : "signup",
                    plan: tier,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                }
            } else {
                const errorData = await res.json().catch(() => ({}));
                toast(errorData.details ? `${errorData.error}: ${errorData.details}` : (errorData.error || "Failed to start checkout. Please try again."), "error");
            }
        } catch (error) {
            console.error("Checkout error:", error);
            toast("Failed to start checkout.", "error");
        } finally {
            setUpgrading(null);
        }
    };

    const handleManageBilling = async () => {
        setBillingLoading(true);
        try {
            const res = await fetch("/api/customer-portal", { method: "POST" });

            let data;
            try {
                data = await res.json();
            } catch (e) {
                throw new Error("Invalid response from server");
            }

            if (res.ok && data.url) {
                window.location.href = data.url;
            } else {
                const errorMsg = data.error || "No active subscription found.";
                toast(errorMsg, res.ok ? "success" : "error");
            }
        } catch (error: unknown) {
            console.error("Billing portal error:", error);
            const message = error instanceof Error ? error.message : "Could not connect to billing portal";
            toast(message, "error");
        } finally {
            setBillingLoading(false);
        }
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        toast("Profile updated successfully", "success");
    };

    const handleGenerateApiKey = async () => {
        setGeneratingKey(true);
        try {
            const res = await fetch("/api/keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Default API Key" }),
            });
            if (res.ok) {
                const data = await res.json();
                setApiKey(data.key || "dk_" + Math.random().toString(36).substring(2, 15));
            }
        } catch {
            setApiKey("dk_" + Math.random().toString(36).substring(2, 15));
        } finally {
            setGeneratingKey(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fetchTeams = async () => {
        setLoadingTeams(true);
        try {
            const res = await fetch("/api/teams");
            if (res.ok) {
                const data = await res.json();
                setTeams(data.teams);
            }
        } catch (error) {
            console.error("Failed to fetch teams", error);
        } finally {
            setLoadingTeams(false);
        }
    };

    const handleInvite = async (teamId: string) => {
        if (!inviteEmail) return;
        setSendingInvite(true);
        try {
            const res = await fetch("/api/teams/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail, teamId }),
            });
            const data = await res.json();
            if (res.ok) {
                setInviteSuccess(`Invitation sent to ${inviteEmail}`);
                setInviteEmail("");
                setInvitingTeamId(null);
                setTimeout(() => setInviteSuccess(null), 3000);
            } else {
                setInviteError(data.error || "Failed to send invite");
            }
        } catch {
            setInviteError("Something went wrong");
        } finally {
            setSendingInvite(false);
        }
    };

    const fetchMembers = async (teamId: string) => {
        if (teamMembers[teamId]) {
            setExpandedTeamId(expandedTeamId === teamId ? null : teamId);
            return;
        }
        setLoadingMembers(true);
        setExpandedTeamId(teamId);
        try {
            const res = await fetch(`/api/teams/${teamId}/members`);
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(prev => ({ ...prev, [teamId]: data.members }));
            }
        } catch (error) {
            console.error("Failed to fetch members", error);
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleRemoveMember = async (teamId: string, userId: string) => {
        if (!confirm("Are you sure?")) return;
        setRemovingMember(userId);
        try {
            const res = await fetch(`/api/teams/${teamId}/members?userId=${userId}`, { method: "DELETE" });
            if (res.ok) {
                setTeamMembers(prev => ({
                    ...prev,
                    [teamId]: prev[teamId].filter((member) => member.userId !== userId)
                }));
                toast("Member removed", "success");
            }
        } catch {
            toast("Something went wrong", "error");
        } finally {
            setRemovingMember(null);
        }
    };



    const tabs = [
        { id: "plans" as const, label: "Plans & Usage", icon: Zap },
        { id: "profile" as const, label: "Profile", icon: User },
        { id: "teams" as const, label: "Teams", icon: Users },
        { id: "api" as const, label: "API Keys", icon: Key },
        { id: "notifications" as const, label: "Notifications", icon: Bell },
        { id: "integrations" as const, label: "Integrations", icon: Blocks },
        { id: "audit" as const, label: "Audit Log", icon: Shield },
        { id: "templates" as const, label: "Templates", icon: Layout },
    ];

    const usagePercentage = usage ? Math.min((usage.filesProcessed / usage.filesLimit) * 100, 100) : 0;

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="max-w-7xl mx-auto p-4 md:p-8 animate-fade-in space-y-8 pb-20">
                <header>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Account Hub</h1>
                    <p className="text-muted-foreground">Manage your subscription, team, and developer settings.</p>
                </header>

                {/* Tab Navigation */}
                <div className="flex flex-wrap gap-2 mb-8 bg-white/5 p-1 rounded-2xl w-max">
                    {tabs.map((tab) => (
                        <Button
                            key={tab.id}
                            variant={activeTab === tab.id ? "primary" : "ghost"}
                            size="sm"
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "transition-all rounded-xl px-4",
                                activeTab === tab.id ? 'shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-white'
                            )}
                            leftIcon={<tab.icon className="w-4 h-4" />}
                        >
                            {tab.label}
                        </Button>
                    ))}
                </div>

                {/* Content Areas */}
                <div className="space-y-8">
                    {activeTab === "plans" && (
                        <>
                            <Card className="glass-card bg-gradient-to-br from-primary/10 to-purple-900/10 border-primary/20">
                                <CardContent className="p-8">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-8">
                                        <div className="flex items-center gap-6">
                                            <div className="w-20 h-20 rounded-3xl bg-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                                                <Zap className="text-primary w-10 h-10" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Current Plan</div>
                                                <h2 className="text-3xl font-bold text-white mb-1">{usage?.plan || "Free Tier"}</h2>
                                                <p className="text-white/60 text-sm">
                                                    {usage?.validUntil ? `Valid until ${usage.validUntil}` : "Basic feature set"}
                                                </p>
                                                {usage?.isDevMode && (
                                                    <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] font-black text-amber-500 uppercase tracking-widest">
                                                        Developer Pro Mode Active
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {usage?.plan && (usage.plan !== "Free" && usage.plan !== "Free Tier") && (
                                            <div className="flex flex-col items-end gap-2">
                                                <Button
                                                    onClick={handleManageBilling}
                                                    isLoading={billingLoading}
                                                    disabled={usage.isDevMode}
                                                    className={cn(
                                                        "bg-white/10 hover:bg-white/20 text-white border border-white/10",
                                                        usage.isDevMode && "opacity-50 cursor-not-allowed"
                                                    )}
                                                    leftIcon={<CreditCard className="w-4 h-4" />}
                                                    title={usage.isDevMode ? "Billing disabled in Dev Mode" : "Manage Subscription"}
                                                >
                                                    Manage Subscription
                                                </Button>
                                                {usage.isDevMode && (
                                                    <span className="text-[10px] text-amber-500/80 font-mono">Simulated Plan (No Billing)</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-6 border-t border-white/10">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <BarChart3 className="w-4 h-4 text-primary" />
                                                <span className="text-sm font-medium text-white/80">Monthly File Usage</span>
                                            </div>
                                            <span className="text-sm font-mono text-white/80">
                                                {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${usage?.filesProcessed || 0} / ${usage?.filesLimit || 10}`}
                                            </span>
                                        </div>
                                        <div className="w-full bg-black/40 h-4 rounded-full overflow-hidden border border-white/5">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all duration-1000 ease-out",
                                                    usagePercentage > 90 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                                                        usagePercentage > 60 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-primary shadow-[0_0_10px_rgba(124,58,237,0.5)]'
                                                )}
                                                style={{ width: `${usagePercentage}%` }}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <InvoiceHistory />

                            <div>
                                <h2 className="text-xl font-bold text-white mb-6">Available Plans</h2>
                                {checkoutCanceled && (
                                    <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 flex items-center justify-between gap-3">
                                        <p className="text-sm text-white/80">
                                            Checkout was canceled. Your selected plan is still here when you&apos;re ready.
                                        </p>
                                        <Button size="sm" variant="outline" onClick={() => setCheckoutCanceled(false)}>
                                            Dismiss
                                        </Button>
                                    </div>
                                )}

                                {trialIntentActive && (
                                    <div className="mb-5 rounded-xl border border-primary/25 bg-primary/10 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <p className="text-sm text-white/80">
                                            Trial intent detected — choose your best-fit plan to continue guided activation.
                                        </p>
                                        <div className="flex items-center gap-3">
                                            {focusedPlanId && (
                                                <span className="text-xs font-black uppercase tracking-widest text-primary">Recommended: {focusedPlanId}</span>
                                            )}
                                            {focusedPlanId && (
                                                <Button
                                                    size="sm"
                                                    className="bg-primary hover:bg-primary/90 text-white"
                                                    isLoading={upgrading === focusedPlanId}
                                                    onClick={() => handleUpgrade(focusedPlanId)}
                                                    disabled={usage?.planId === focusedPlanId}
                                                >
                                                    {usage?.planId === focusedPlanId
                                                        ? "Already Active"
                                                        : `Start ${focusedPlanId.charAt(0).toUpperCase()}${focusedPlanId.slice(1)} Trial`}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {PLANS.map((plan) => (
                                        <Card
                                            key={plan.id}
                                            id={`plan-card-${plan.id}`}
                                            className={cn(
                                                "flex flex-col relative overflow-hidden transition-all duration-300 hover:scale-[1.02]",
                                                plan.popular ? 'border-primary/50 bg-primary/5 shadow-2xl shadow-primary/10' : 'bg-black/20 hover:bg-black/30',
                                                focusedPlanId === plan.id && 'ring-2 ring-primary/60 border-primary shadow-2xl shadow-primary/20'
                                            )}
                                        >
                                            {plan.popular && (
                                                <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary blur-[40px] opacity-40"></div>
                                            )}
                                            <CardHeader>
                                                {plan.popular && (
                                                    <div className="text-xs font-bold text-white bg-primary px-3 py-1 rounded-full w-max mb-2 shadow-lg shadow-primary/20">MOST POPULAR</div>
                                                )}
                                                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                                                <div className="mt-2">
                                                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                                                    <span className="text-white/40 text-sm"> / month</span>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="flex-grow flex flex-col">
                                                <ul className="space-y-4 mb-8 flex-grow">
                                                    <li className="flex items-center gap-3 text-sm text-white">
                                                        <div className="p-1 rounded-full bg-primary/20"><Zap className="w-3 h-3 text-primary" /></div>
                                                        <span className="font-bold">{plan.limit}</span>
                                                    </li>
                                                    {usage?.planId === plan.id && (
                                                        <li className="flex items-center gap-3 text-xs text-green-400 font-bold bg-green-400/10 p-2 rounded-lg border border-green-400/20">
                                                            <CheckCircle2 className="w-4 h-4" /> CURRENT PLAN
                                                        </li>
                                                    )}
                                                    {plan.features.map((feature, idx) => (
                                                        <li key={idx} className="flex items-center gap-3 text-sm text-white/70">
                                                            <CheckCircle2 className="w-4 h-4 text-green-400/80 flex-shrink-0" />
                                                            {feature}
                                                        </li>
                                                    ))}
                                                </ul>
                                                <Button
                                                    onClick={() => handleUpgrade(plan.id)}
                                                    disabled={upgrading === plan.id || usage?.planId === plan.id}
                                                    variant={plan.popular || focusedPlanId === plan.id ? "primary" : "outline"}
                                                    isLoading={upgrading === plan.id}
                                                    className="w-full"
                                                >
                                                    {upgrading === plan.id
                                                        ? "Processing..."
                                                        : usage?.planId === plan.id
                                                            ? "Current Plan"
                                                            : focusedPlanId === plan.id
                                                                ? `Continue with ${plan.name}`
                                                                : `Upgrade to ${plan.name}`}
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "profile" && (
                        <Card className="glass-card bg-black/40">
                            <CardHeader>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>Update your personal details.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium text-white/80">Email Address</label>
                                    <div className="glass-input opacity-60 p-3 rounded-xl cursor-not-allowed text-white/60">{session?.user?.email}</div>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-medium text-white/80">Display Name</label>
                                    <input type="text" placeholder="Your name" defaultValue={session?.user?.name || ""} className="glass-input p-3 rounded-xl w-full outline-none" />
                                </div>
                                <div className="pt-4 flex justify-end">
                                    <Button onClick={handleSaveProfile} isLoading={saving}>{saved ? "Saved!" : "Save Changes"}</Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {activeTab === "teams" && (
                        <Card className="glass-card bg-black/40">
                            <CardHeader>
                                <CardTitle>Team Management</CardTitle>
                                <CardDescription>Manage your teams and invites.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {loadingTeams ? (
                                    <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-white/20" /></div>
                                ) : teams.length === 0 ? (
                                    <div className="text-center py-12 bg-white/5 rounded-xl border border-dashed border-white/10">
                                        <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
                                        <p className="text-white/60">You don&apos;t belong to any teams yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {teams.map((team) => (
                                            <div key={team.id} className="border border-white/10 rounded-xl p-6 bg-white/5">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div>
                                                        <h4 className="font-semibold text-white text-lg flex items-center gap-2">
                                                            {team.name}
                                                            <span className="text-xs px-2 py-0.5 rounded-full uppercase font-bold bg-amber-500/20 text-amber-400 border border-amber-500/20">{team.role}</span>
                                                        </h4>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button variant="ghost" size="sm" onClick={() => fetchMembers(team.id)}>View</Button>
                                                        <Button variant="outline" size="sm" onClick={() => setInvitingTeamId(team.id)}>Invite</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {activeTab === "api" && (
                        <Card className="glass-card bg-black/40">
                            <CardHeader>
                                <CardTitle>API Access</CardTitle>
                                <CardDescription>Manage API keys for external integrations.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {apiKey ? (
                                    <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                                        <code className="text-sm font-mono text-primary">{apiKey}</code>
                                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(apiKey)}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button>
                                    </div>
                                ) : (
                                    <Button onClick={handleGenerateApiKey} isLoading={generatingKey} leftIcon={<Key className="w-4 h-4" />}>Generate API Key</Button>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {activeTab === "notifications" && (
                        <Card className="glass-card bg-black/40">
                            <CardHeader>
                                <CardTitle>Notifications</CardTitle>
                                <CardDescription>Manage your alert preferences.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {["Weekly digests", "Product updates", "System alerts"].map(item => (
                                    <div key={item} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                        <span className="text-white font-medium">{item}</span>
                                        <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-white/20 bg-black/20 text-primary" />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    {activeTab === "integrations" && (
                        <Card className="glass-card bg-black/40">
                            <CardHeader>
                                <CardTitle>Integrations</CardTitle>
                                <CardDescription>Connect with external platforms.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between p-6 bg-white/5 rounded-2xl border border-white/10">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-white text-black p-2 rounded-lg"><Github className="w-6 h-6" /></div>
                                        <div>
                                            <h4 className="font-semibold text-white">GitHub Connection</h4>
                                            <p className="text-sm text-white/40">Sync repositories and PRs</p>
                                        </div>
                                    </div>
                                    <Button variant="outline">Connect</Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {activeTab === "audit" && <AuditLogViewer />}
                    {activeTab === "templates" && (
                        <Card className="glass-card bg-black/40">
                            <CardHeader>
                                <CardTitle>Templates</CardTitle>
                                <CardDescription>Manage your shared documentation templates.</CardDescription>
                            </CardHeader>
                            <CardContent><TemplateManager /></CardContent>
                        </Card>
                    )}
                </div>

                <div className="mt-8 text-center text-sm text-white/30">
                    <p>DocuMint AI Platform Configuration • Version 1.0.4</p>
                    <Button variant="ghost" size="sm" onClick={() => signOut()} className="mt-4 text-rose-400 hover:bg-rose-500/10">Sign Out</Button>
                </div>
            </div>
        </div>
    );
}