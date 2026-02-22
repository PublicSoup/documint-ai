"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Users, Mail, X, Activity, Sparkles, CheckCircle2, Share2, RefreshCw, Award, AlertTriangle } from "lucide-react";
import { useToast } from "./toast";
import { TeamIntegrations } from "./team-integrations";
import { TeamActivityFeed } from "./team-activity-feed";
import { TeamHealthPDFExport } from "./team-health-pdf";
import { TeamGeneralSettings } from "./team-general-settings";
import { TeamAnalytics } from "./team-analytics";
import { cn } from "@/lib/utils";

interface Team {
    id: string;
    name: string;
    slug: string;
    role: string; // MEMBER, ADMIN, OWNER
    members: { userId: string; role: string; user: { name: string; email: string; image: string } }[];
    invites?: { id: string; email: string; role: string; createdAt: string }[];
}

export default function TeamManagement() {
    const { toast } = useToast();
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [newTeamName, setNewTeamName] = useState("");
    const [creating, setCreating] = useState(false);
    const [triggeringReport, setTriggeringReport] = useState<string | null>(null);
    const [rescanning, setRescanning] = useState<string | null>(null);

    // Invite States
    const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
    const [inviteRole, setInviteRole] = useState<Record<string, "MEMBER" | "ADMIN">>({});
    const [inviting, setInviting] = useState<Record<string, boolean>>({});

    const [revoking, setRevoking] = useState<Record<string, boolean>>({});
    const [updatingRole, setUpdatingRole] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState<Record<string, "members" | "analytics" | "integrations" | "settings">>({});

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchTeams = async (options?: { background?: boolean }) => {
        const background = options?.background ?? false;

        if (!background) {
            setLoading(true);
        }

        setLoadError("");

        try {
            const res = await fetch("/api/teams");
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || "Failed to load teams");
            }

            setTeams(Array.isArray(data.teams) ? data.teams : []);
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to load teams";
            setLoadError(message);
            return false;
        } finally {
            if (!background) {
                setLoading(false);
            }
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        const ok = await fetchTeams({ background: true });
        if (!ok) {
            toast("Unable to refresh teams right now.", "error");
        }
        setRefreshing(false);
    };

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTeamName.trim()) return;

        setCreating(true);
        try {
            const res = await fetch("/api/teams/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newTeamName }),
            });

            if (res.ok) {
                setNewTeamName("");
                await fetchTeams({ background: true });
                toast("Team created successfully!", "success");
            } else {
                const data = await res.json().catch(() => ({}));
                toast(data.error || "Failed to create team", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Failed to create team", "error");
        } finally {
            setCreating(false);
        }
    };

    const handleTriggerHealthReport = async (teamId: string) => {
        setTriggeringReport(teamId);
        try {
            const res = await fetch(`/api/teams/${teamId}/health-report`, {
                method: "POST",
            });

            if (res.ok) {
                const data = await res.json();
                toast(data.message || "Health report generated and sent to all members.", "success");
            } else {
                const data = await res.json();
                toast(data.error || "Failed to generate health report.", "error");
            }
        } catch (error) {
            console.error(error);
            toast("An unexpected error occurred.", "error");
        } finally {
            setTriggeringReport(null);
        }
    };

    const handleRescan = async (teamId: string) => {
        setRescanning(teamId);
        try {
            const res = await fetch(`/api/teams/${teamId}/rescan`, {
                method: "POST",
            });

            if (res.ok) {
                const data = await res.json();
                toast(data.message || "Project rescan complete.", "success");
                await fetchTeams({ background: true });
            } else {
                const data = await res.json();
                toast(data.error || "Failed to perform rescan.", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error performing project rescan.", "error");
        } finally {
            setRescanning(null);
        }
    };

    const handleInvite = async (teamId: string) => {
        const email = inviteEmail[teamId];
        const role = inviteRole[teamId] || "MEMBER";

        if (!email) return;

        setInviting(prev => ({ ...prev, [teamId]: true }));
        try {
            const res = await fetch("/api/teams/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ teamId, email, role }),
            });

            if (res.ok) {
                toast(`Invitation sent to ${email}`, "success");
                setInviteEmail(prev => ({ ...prev, [teamId]: "" }));
                await fetchTeams({ background: true });
            } else {
                const data = await res.json();
                toast(data.error || "Failed to send invitation", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error sending invitation", "error");
        } finally {
            setInviting(prev => ({ ...prev, [teamId]: false }));
        }
    };

    const handleRevokeInvite = async (inviteId: string) => {
        setRevoking(prev => ({ ...prev, [inviteId]: true }));
        try {
            const res = await fetch(`/api/teams/invite/revoke?inviteId=${inviteId}`, {
                method: "DELETE",
            });

            if (res.ok) {
                toast("Invitation revoked", "success");
                await fetchTeams({ background: true });
            } else {
                toast("Failed to revoke invitation", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error revoking invitation", "error");
        } finally {
            setRevoking(prev => ({ ...prev, [inviteId]: false }));
        }
    };

    const handleUpdateRole = async (teamId: string, userId: string, newRole: string) => {
        setUpdatingRole(prev => ({ ...prev, [`${teamId}-${userId}`]: true }));
        try {
            const res = await fetch(`/api/teams/${teamId}/members`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role: newRole }),
            });

            if (res.ok) {
                toast("Role updated successfully", "success");
                await fetchTeams({ background: true });
            } else {
                const data = await res.json();
                toast(data.error || "Failed to update role", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error updating role", "error");
        } finally {
            setUpdatingRole(prev => ({ ...prev, [`${teamId}-${userId}`]: false }));
        }
    };

    const handleRemoveMember = async (teamId: string, userId: string) => {
        if (!confirm("Are you sure you want to remove this member?")) return;

        try {
            const res = await fetch(`/api/teams/${teamId}/members?userId=${userId}`, {
                method: "DELETE",
            });

            if (res.ok) {
                toast("Member removed", "success");
                await fetchTeams({ background: true });
            } else {
                const data = await res.json();
                toast(data.error || "Failed to remove member", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error removing member", "error");
        }
    };

    if (loading) {
        return (
            <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
        );
    }

    if (loadError && teams.length === 0) {
        return (
            <Card className="glass-card border-amber-500/20 bg-amber-500/5">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-start gap-3 text-amber-200">
                        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-bold">Unable to load team workspace</p>
                            <p className="text-xs text-amber-100/70 mt-1">{loadError}</p>
                        </div>
                    </div>
                    <Button onClick={() => fetchTeams()} className="h-9">
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Create Team */}
            <Card className="glass-card border-white/5">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Create New Team
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreateTeam} className="flex gap-4">
                        <Input
                            placeholder="Team Name"
                            value={newTeamName}
                            onChange={(e) => setNewTeamName(e.target.value)}
                            className="bg-black/20 border-white/10 text-white"
                        />
                        <Button disabled={creating || !newTeamName.trim()}>
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Team"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* List Teams */}
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">Your Teams</h3>
                    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="h-8 gap-2">
                        {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Refresh
                    </Button>
                </div>

                {loadError && teams.length > 0 && (
                    <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {loadError}
                    </div>
                )}

                {teams.length === 0 ? (
                    <p className="text-muted-foreground italic">You are not a member of any teams yet.</p>
                ) : (
                    teams.map(team => (
                        <Card key={team.id} className="glass-card border-white/5 overflow-hidden">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-white/5">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-bold text-white">{team.name}</CardTitle>
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => setActiveTab(prev => ({ ...prev, [team.id]: "members" }))}
                                            className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", (activeTab[team.id] || "members") === "members" ? "text-primary" : "text-zinc-500 hover:text-zinc-300")}
                                        >
                                            Members
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab(prev => ({ ...prev, [team.id]: "analytics" }))}
                                            className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", activeTab[team.id] === "analytics" ? "text-primary" : "text-zinc-500 hover:text-zinc-300")}
                                        >
                                            Analytics
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab(prev => ({ ...prev, [team.id]: "integrations" }))}
                                            className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", activeTab[team.id] === "integrations" ? "text-primary" : "text-zinc-500 hover:text-zinc-300")}
                                        >
                                            Integrations
                                        </button>
                                        {team.role === "OWNER" && (
                                            <button 
                                                onClick={() => setActiveTab(prev => ({ ...prev, [team.id]: "settings" }))}
                                                className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", activeTab[team.id] === "settings" ? "text-primary" : "text-zinc-500 hover:text-zinc-300")}
                                            >
                                                Settings
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary-foreground uppercase font-bold">
                                    {team.role}
                                </span>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="space-y-6">
                                    {(activeTab[team.id] || "members") === "members" && (
                                        <>
                                            {(team.role === "OWNER" || team.role === "ADMIN") && (
                                                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <Activity className="w-4 h-4 text-emerald-400" />
                                                            <span className="text-xs font-bold text-emerald-100 uppercase tracking-wider">Team Health Reporting</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-[10px] text-zinc-500 bg-black/20 px-2 py-1 rounded-full border border-white/5">
                                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                            Weekly: Mon @ 9AM
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-white/50 leading-relaxed">
                                                        Automatically monitor documentation coverage and drift across the entire team project.
                                                    </p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={triggeringReport === team.id}
                                                            onClick={() => handleTriggerHealthReport(team.id)}
                                                            className="w-full bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 gap-2 h-8 text-[11px] font-bold"
                                                        >
                                                            {triggeringReport === team.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Sparkles className="w-3 h-3" />
                                                            )}
                                                            Manual Report
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={rescanning === team.id}
                                                            onClick={() => handleRescan(team.id)}
                                                            className="w-full bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 gap-2 h-8 text-[11px] font-bold"
                                                        >
                                                            {rescanning === team.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <RefreshCw className="w-3 h-3" />
                                                            )}
                                                            Detect Drift
                                                        </Button>
                                                    </div>
                                                    <TeamHealthPDFExport teamId={team.id} teamName={team.name} />
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Team Members</label>
                                                <div className="space-y-2">
                                                    {team.members?.map(member => (
                                                        <div key={member.userId} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-all">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-8 w-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-xs text-white font-bold overflow-hidden shrink-0">
                                                                    {member.user.image ? (
                                                                        <img src={member.user.image} alt={member.user.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <span>{member.user.name?.[0] || member.user.email[0].toUpperCase()}</span>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold text-white truncate">{member.user.name || member.user.email}</p>
                                                                    <p className="text-[9px] text-zinc-500 uppercase tracking-tighter font-black italic">{member.role}</p>
                                                                </div>
                                                            </div>

                                                            {(team.role === "OWNER" || team.role === "ADMIN") && member.role !== "OWNER" && (
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <select
                                                                        value={member.role}
                                                                        disabled={updatingRole[`${team.id}-${member.userId}`]}
                                                                        onChange={(e) => handleUpdateRole(team.id, member.userId, e.target.value)}
                                                                        className="bg-[#111111] border border-white/10 text-white rounded-lg px-2 py-1 text-[10px] font-bold outline-none h-7"
                                                                    >
                                                                        <option value="MEMBER">Member</option>
                                                                        <option value="EDITOR">Editor</option>
                                                                        <option value="ADMIN">Admin</option>
                                                                        {team.role === "OWNER" && <option value="OWNER">Owner</option>}
                                                                    </select>
                                                                    <button 
                                                                        onClick={() => handleRemoveMember(team.id, member.userId)}
                                                                        className="p-1.5 text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                                                        title="Remove Member"
                                                                    >
                                                                        <X className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {(team.role === "OWNER" || team.role === "ADMIN") && (
                                                    <div className="pt-2 border-t border-white/5 space-y-3">
                                                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1 flex items-center gap-2">
                                                            <Mail className="w-3 h-3" />
                                                            Invite New Member
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <Input 
                                                                placeholder="colleague@company.com" 
                                                                value={inviteEmail[team.id] || ""}
                                                                onChange={(e) => setInviteEmail(prev => ({ ...prev, [team.id]: e.target.value }))}
                                                                className="bg-white/5 text-white border-white/10 h-9 text-xs flex-1" 
                                                            />
                                                            <select
                                                                value={inviteRole[team.id] || "MEMBER"}
                                                                onChange={(e) => setInviteRole(prev => ({ ...prev, [team.id]: e.target.value as "MEMBER" | "ADMIN" }))}
                                                                className="bg-[#18181b] border-white/10 text-white rounded-md px-2 text-xs focus:ring-1 focus:ring-primary outline-none h-9"
                                                            >
                                                                <option value="MEMBER">Member</option>
                                                                <option value="ADMIN">Admin</option>
                                                            </select>
                                                            <Button 
                                                                variant="secondary" 
                                                                size="sm" 
                                                                className="h-9 font-bold"
                                                                disabled={!inviteEmail[team.id] || inviting[team.id]}
                                                                onClick={() => handleInvite(team.id)}
                                                            >
                                                                {inviting[team.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : "Invite"}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}

                                                {team.invites && team.invites.length > 0 && (
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Pending Invitations</label>
                                                        <div className="space-y-1">
                                                            {team.invites.map(invite => (
                                                                <div key={invite.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5 group">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-xs text-white/90">{invite.email}</span>
                                                                        <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-tight">{invite.role}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">Sent {new Date(invite.createdAt).toLocaleDateString()}</span>
                                                                        {(team.role === "OWNER" || team.role === "ADMIN") && (
                                                                            <button 
                                                                                className="p-1 hover:bg-red-500/20 rounded text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                                                title="Revoke Invitation"
                                                                                disabled={revoking[invite.id]}
                                                                                onClick={() => handleRevokeInvite(invite.id)}
                                                                            >
                                                                                {revoking[invite.id] ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <X className="w-2.5 h-2.5" />}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="pt-6 border-t border-white/5">
                                                <TeamActivityFeed teamId={team.id} />
                                            </div>

                                            <div className="pt-6 border-t border-white/5 space-y-3">
                                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1 flex items-center gap-2">
                                                    <Award className="w-3 h-3 text-emerald-400" />
                                                    Documentation Badge
                                                </label>
                                                <div className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/5">
                                                    <img 
                                                        src={`/api/teams/${team.id}/badge`} 
                                                        alt="Documentation Status" 
                                                        className="h-5 shrink-0" 
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <Input 
                                                            readOnly 
                                                            value={`[![Documentation Status](${typeof window !== 'undefined' ? window.location.origin : ''}/api/teams/${team.id}/badge)](${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard?teamId=${team.id})`}
                                                            className="bg-black/40 border-white/10 text-white text-[9px] font-mono h-8 rounded-xl"
                                                            onClick={(e) => {
                                                                (e.target as HTMLInputElement).select();
                                                                navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                                                                toast("Markdown copied!", "success");
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <p className="text-[9px] text-zinc-500 italic px-1 tracking-tight">Embed this dynamic coverage badge in your README or internal docs.</p>
                                            </div>
                                        </>
                                    )}

                                    {activeTab[team.id] === "analytics" && (
                                        <div className="animate-in fade-in duration-300">
                                            <TeamAnalytics teamId={team.id} />
                                        </div>
                                    )}

                                    {activeTab[team.id] === "integrations" && (
                                        <div className="animate-in fade-in duration-300">
                                            <TeamIntegrations teamId={team.id} />
                                        </div>
                                    )}

                                    {activeTab[team.id] === "settings" && (
                                        <div className="animate-in fade-in duration-300">
                                            <TeamGeneralSettings teamId={team.id} teamName={team.name} teamSlug={team.slug} />
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
