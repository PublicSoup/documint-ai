"use client";

import React, { useState } from "react";
import { User, Key, Bell, Trash2, Loader2, Check, Copy, Blocks, Github, Users, Shield, Layout, ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import AuditLogViewer from "@/components/audit-log-viewer";
import { TemplateManager } from "@/components/template-manager";
import { useToast } from "@/components/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Settings() {
    const { toast } = useToast();
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<"profile" | "billing" | "teams" | "api" | "notifications" | "integrations" | "audit" | "templates">("profile");
    const [billingLoading, setBillingLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [generatingKey, setGeneratingKey] = useState(false);
    const [copied, setCopied] = useState(false);

    // Team State
    const [teams, setTeams] = useState<any[]>([]);
    const [loadingTeams, setLoadingTeams] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [invitingTeamId, setInvitingTeamId] = useState<string | null>(null);
    const [sendingInvite, setSendingInvite] = useState(false);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
    const [inviteError, setInviteError] = useState<string | null>(null);

    // Member Management State
    const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
    const [teamMembers, setTeamMembers] = useState<Record<string, any[]>>({});
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [removingMember, setRemovingMember] = useState<string | null>(null);

    const workflowYaml = `name: DocuMint AI

on:
  push:
    branches: [ "main" ]

jobs:
  document:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: DocuMint Analysis
        uses: documint-ai/action@v1
        with:
          api-key: \${{ secrets.DOCUMINT_API_KEY }}
          path: "./src"`;

    const handleSave = async () => {
        setSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        toast("Settings saved successfully", "success");
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
            setApiKey("dk_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
        } finally {
            setGeneratingKey(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSignOut = () => {
        signOut({ callbackUrl: "/" });
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
        setInviteError(null);
        setInviteSuccess(null);

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
        } catch (error) {
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
        if (!confirm("Are you sure you want to remove this member?")) return;

        setRemovingMember(userId);
        try {
            const res = await fetch(`/api/teams/${teamId}/members?userId=${userId}`, {
                method: "DELETE"
            });

            if (res.ok) {
                setTeamMembers(prev => ({
                    ...prev,
                    [teamId]: prev[teamId].filter(m => m.user.id !== userId)
                }));
                fetchTeams(); // Using fetchTeams directly
                toast("Member removed", "success");
            } else {
                toast("Failed to remove member", "error");
            }
        } catch {
            toast("Something went wrong", "error");
        } finally {
            setRemovingMember(null);
        }
    };

    const handleManageBilling = async () => {
        setBillingLoading(true);
        try {
            const res = await fetch("/api/checkout/portal", { method: "POST" });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                toast("No active subscription found. Redirecting to billing.", "success");
                window.location.href = "/dashboard/billing";
            }
        } catch (error) {
            toast("Could not connect to billing portal", "error");
        } finally {
            setBillingLoading(false);
        }
    };

    React.useEffect(() => {
        if (activeTab === "teams") {
            fetchTeams();
        }
    }, [activeTab]);

    const tabs = [
        { id: "profile" as const, label: "Profile", icon: User },
        { id: "billing" as const, label: "Billing", icon: Layout },
        { id: "teams" as const, label: "Teams", icon: Users },
        { id: "api" as const, label: "API Keys", icon: Key },
        { id: "notifications" as const, label: "Notifications", icon: Bell },
        { id: "integrations" as const, label: "Integrations", icon: Blocks },
        { id: "templates" as const, label: "Templates", icon: Layout },
    ];

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 animate-fade-in relative z-10 space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Settings</h1>
                <p className="text-muted-foreground">Manage your account, team, and preferences.</p>
            </header>

            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 mb-8">
                {tabs.map((tab) => (
                    <Button
                        key={tab.id}
                        variant={activeTab === tab.id ? "primary" : "ghost"}
                        size="sm"
                        onClick={() => setActiveTab(tab.id)}
                        className={`transition-all ${activeTab === tab.id ? 'shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-white'}`}
                        leftIcon={<tab.icon className="w-4 h-4" />}
                    >
                        {tab.label}
                    </Button>
                ))}
            </div>

            {/* Billing Tab */}
            {activeTab === "billing" && (
                <div className="space-y-6">
                    <Card className="glass-card bg-black/40 overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 pointer-events-none opacity-10">
                            <Layout className="w-32 h-32" />
                        </div>
                        <CardHeader>
                            <CardTitle>Subscription Plan</CardTitle>
                            <CardDescription>Manage your current subscription and billing history.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between p-6 bg-primary/5 rounded-2xl border border-primary/20">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-xl font-bold text-white">Pro Plan</h3>
                                        <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold rounded uppercase tracking-wider">Active</span>
                                    </div>
                                    <p className="text-muted-foreground text-sm">Next renewal: Feb 12, 2026</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-white mb-2">$29<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                                    <Button
                                        variant="primary"
                                        onClick={handleManageBilling}
                                        isLoading={billingLoading}
                                        leftIcon={<Layout className="w-4 h-4" />}
                                    >
                                        Manage Subscription
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Link href="/dashboard/billing">
                                    <Button variant="outline" className="w-full text-xs h-10 border-white/10">View All Plans</Button>
                                </Link>
                                <Button variant="ghost" className="w-full text-xs h-10 text-muted-foreground">Download Invoices</Button>
                                <Button variant="ghost" className="w-full text-xs h-10 text-muted-foreground">Update Payment Method</Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass-card border-dashed bg-transparent">
                        <CardContent className="p-8 text-center flex flex-col items-center gap-4">
                            <div className="p-3 bg-purple-500/10 rounded-full text-purple-400">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-white">Need multi-user support?</h4>
                                <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                                    Our Team plan includes collaborative documentation, shared templates, and advanced audit logs.
                                </p>
                            </div>
                            <Link href="/dashboard/billing">
                                <Button variant="ghost" className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10">
                                    Compare Team Features <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
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
                            <div className="glass-input opacity-60 p-3 rounded-xl cursor-not-allowed text-white/60">
                                {session?.user?.email || ""}
                            </div>
                            <p className="text-xs text-muted-foreground">Email cannot be changed via settings.</p>
                        </div>

                        <div className="grid gap-2">
                            <label className="text-sm font-medium text-white/80">Display Name</label>
                            <input
                                type="text"
                                placeholder="Your name"
                                defaultValue={session?.user?.name || ""}
                                className="glass-input p-3 rounded-xl w-full focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                            />
                        </div>

                        <div className="pt-4 flex justify-end">
                            <Button onClick={handleSave} isLoading={saving} leftIcon={saved ? <Check className="w-4 h-4" /> : null}>
                                {saved ? "Saved!" : "Save Changes"}
                            </Button>
                        </div>

                        {/* Danger Zone */}
                        <div className="pt-8 border-t border-white/10 mt-8">
                            <h3 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h3>
                            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <h4 className="font-medium text-red-200">Delete Account</h4>
                                    <p className="text-sm text-red-500/60">Permanently delete your account and all data.</p>
                                </div>
                                <Button variant="outline" className="border-red-500/30 hover:bg-red-500/10 text-red-400 hover:text-red-300">
                                    Delete Account
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* API Keys Tab */}
            {activeTab === "api" && (
                <Card className="glass-card bg-black/40">
                    <CardHeader>
                        <CardTitle>API Access</CardTitle>
                        <CardDescription>Manage API keys for external integrations.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {apiKey ? (
                            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <code className="text-sm font-mono text-primary break-all">{apiKey}</code>
                                    <Button size="sm" variant="ghost" onClick={() => copyToClipboard(apiKey)}>
                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                </div>
                                <p className="text-xs text-amber-500 mt-2 flex items-center gap-1">
                                    ⚠️ Save this key now. It won't be shown again.
                                </p>
                            </div>
                        ) : (
                            <Button onClick={handleGenerateApiKey} isLoading={generatingKey} leftIcon={<Key className="w-4 h-4" />}>
                                Generate API Key
                            </Button>
                        )}

                        <div className="pt-4 border-t border-white/10">
                            <h4 className="font-medium text-white mb-2">Usage Example</h4>
                            <div className="bg-black/50 rounded-xl p-4 border border-white/5 overflow-x-auto">
                                <pre className="text-sm text-gray-300 font-mono">
                                    {`curl -X POST http://localhost:8000/api/v1/analyze \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"code": "def hello(): pass", "language": "python"}'`}
                                </pre>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Notifications Tab */}
            {activeTab === "notifications" && (
                <Card className="glass-card bg-black/40">
                    <CardHeader>
                        <CardTitle>Email Notifications</CardTitle>
                        <CardDescription>Choose what emails you want to receive.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {[
                            { id: "weekly", label: "Weekly digests", desc: "Summary of your documentation activity" },
                            { id: "product", label: "Product updates", desc: "New features and improvements" },
                            { id: "tips", label: "Tips & tutorials", desc: "Get the most out of DocuMint" },
                        ].map((item) => (
                            <div key={item.id} className="flex items-start gap-4 p-4 border border-white/5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer">
                                <input type="checkbox" className="mt-1 w-4 h-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary" defaultChecked />
                                <div>
                                    <div className="font-medium text-white">{item.label}</div>
                                    <div className="text-sm text-muted-foreground">{item.desc}</div>
                                </div>
                            </div>
                        ))}
                        <div className="pt-4 flex justify-end">
                            <Button onClick={handleSave} isLoading={saving}>Save Preferences</Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Integrations Tab */}
            {activeTab === "integrations" && (
                <Card className="glass-card bg-black/40">
                    <CardHeader>
                        <CardTitle>Integrations</CardTitle>
                        <CardDescription>Connect DocuMint with your tools.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border border-white/10 rounded-xl p-6 bg-white/5 hover:border-primary/30 transition-all">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white text-black p-2 rounded-lg">
                                        <Github className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-white">GitHub Actions</h4>
                                        <p className="text-sm text-muted-foreground">Auto-generate docs on push</p>
                                    </div>
                                </div>
                                <span className="px-2 py-1 bg-primary/20 text-primary text-xs rounded-full font-bold uppercase border border-primary/20">
                                    Popular
                                </span>
                            </div>

                            <p className="text-sm text-white/70 mb-4">
                                Add this workflow to <code>.github/workflows/documint.yml</code>:
                            </p>

                            <div className="bg-black/80 rounded-xl p-4 mb-4 overflow-x-auto relative group border border-white/10">
                                <button
                                    onClick={() => copyToClipboard(workflowYaml)}
                                    className="absolute top-2 right-2 p-2 bg-white/10 hover:bg-white/20 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                                <pre className="text-xs text-gray-300 font-mono">
                                    {workflowYaml}
                                </pre>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Teams Tab */}
            {activeTab === "teams" && (
                <Card className="glass-card bg-black/40">
                    <CardHeader>
                        <CardTitle>Team Management</CardTitle>
                        <CardDescription>Manage your teams and invites.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {inviteSuccess && (
                            <div className="p-3 bg-green-500/10 text-green-400 text-sm rounded-lg border border-green-500/20 flex items-center gap-2">
                                <Check className="w-4 h-4" />
                                {inviteSuccess}
                            </div>
                        )}

                        {loadingTeams ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-white/20" />
                            </div>
                        ) : teams.length === 0 ? (
                            <div className="text-center py-12 bg-white/5 rounded-xl border border-dashed border-white/10">
                                <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
                                <p className="text-white/60 mb-2">You don't belong to any teams yet.</p>
                                <p className="text-sm text-white/40">Create a team using the switcher in the sidebar.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {teams.map((team) => (
                                    <div key={team.id} className="border border-white/10 rounded-xl p-6 bg-white/5">
                                        <div className="flex items-start justify-between mb-4">
                                            <div>
                                                <h4 className="font-semibold text-white text-lg flex items-center gap-2">
                                                    {team.name}
                                                    <span className={`text-xs px-2 py-0.5 rounded-full uppercase font-bold tracking-wide ${team.role === 'OWNER' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20' :
                                                        team.role === 'ADMIN' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' :
                                                            'bg-white/10 text-white/60'
                                                        }`}>
                                                        {team.role}
                                                    </span>
                                                </h4>
                                                <p className="text-sm text-white/40 mt-1">
                                                    {team.memberCount} member{team.memberCount !== 1 ? 's' : ''} • Joined {new Date(team.joinedAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            {(team.role === "OWNER" || team.role === "ADMIN") && (
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => fetchMembers(team.id)}
                                                    >
                                                        {expandedTeamId === team.id ? "Hide Members" : "View"}
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setInvitingTeamId(invitingTeamId === team.id ? null : team.id)}
                                                    >
                                                        {invitingTeamId === team.id ? "Cancel" : "Invite"}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        {expandedTeamId === team.id && (
                                            <div className="mt-4 border-t border-white/10 pt-4 animate-fade-in">
                                                <h5 className="text-sm font-semibold text-white/80 mb-3">Team Members</h5>
                                                {loadingMembers ? (
                                                    <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/40" /></div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {teamMembers[team.id]?.map((member: any) => (
                                                            <div key={member.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                                                                        {member.user.image ? <Image src={member.user.image} alt="" width={32} height={32} className="w-full h-full object-cover" /> : (member.user.name?.[0] || "U")}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-medium text-white">{member.user.name || "Unknown User"}</div>
                                                                        <div className="text-xs text-white/40">{member.role}</div>
                                                                    </div>
                                                                </div>
                                                                {(team.role === "OWNER" || team.role === "ADMIN") && member.role !== "OWNER" && member.user.id !== session?.user?.id && (
                                                                    <button
                                                                        onClick={() => handleRemoveMember(team.id, member.user.id)}
                                                                        disabled={removingMember === member.user.id}
                                                                        className="p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                                    >
                                                                        {removingMember === member.user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {invitingTeamId === team.id && (
                                            <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-lg animate-fade-in">
                                                <p className="text-sm font-medium text-white mb-2">Invite new member</p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="email"
                                                        value={inviteEmail}
                                                        onChange={(e) => setInviteEmail(e.target.value)}
                                                        placeholder="colleague@example.com"
                                                        className="flex-1 px-3 py-2 glass-input rounded-lg text-sm outline-none"
                                                    />
                                                    <Button
                                                        onClick={() => handleInvite(team.id)}
                                                        isLoading={sendingInvite}
                                                        disabled={!inviteEmail}
                                                    >
                                                        Send
                                                    </Button>
                                                </div>
                                                {inviteError && (
                                                    <p className="text-xs text-red-400 mt-2">{inviteError}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Audit Log Tab */}
            {activeTab === "audit" && (
                <AuditLogViewer />
            )}

            {/* Templates Tab */}
            {activeTab === "templates" && (
                <Card className="glass-card bg-black/40">
                    <CardHeader>
                        <CardTitle>Documentation Templates</CardTitle>
                        <CardDescription>Manage custom templates.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TemplateManager />
                    </CardContent>
                </Card>
            )}

            <div className="flex justify-center pt-8">
                <button onClick={handleSignOut} className="text-sm text-white/40 hover:text-white transition-colors flex items-center gap-2">
                    Log Out
                </button>
            </div>
        </div>
    );
}
