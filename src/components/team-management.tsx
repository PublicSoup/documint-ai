"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Users, Mail, X } from "lucide-react";

interface Team {
    id: string;
    name: string;
    slug: string;
    role: string; // MEMBER, ADMIN, OWNER
    members: { userId: string; user: { name: string; email: string; image: string } }[];
}

export default function TeamManagement() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTeamName, setNewTeamName] = useState("");
    const [creating, setCreating] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchTeams = async () => {
        try {
            const res = await fetch("/api/teams");
            if (res.ok) {
                const data = await res.json();
                setTeams(data.teams || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
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
                fetchTeams();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setCreating(false);
        }
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>;

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
                <h3 className="text-lg font-semibold text-white">Your Teams</h3>
                {teams.length === 0 ? (
                    <p className="text-muted-foreground italic">You are not a member of any teams yet.</p>
                ) : (
                    teams.map(team => (
                        <Card key={team.id} className="glass-card border-white/5">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-base font-bold text-white">{team.name}</CardTitle>
                                <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary-foreground uppercase font-bold">
                                    {team.role}
                                </span>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {/* Members List (Simplified) */}
                                    <div className="flex -space-x-2 overflow-hidden py-2">
                                        {team.members?.map(member => (
                                            <div key={member.userId} title={member.user.email} className="inline-block h-8 w-8 rounded-full bg-gray-700 border-2 border-[#18181b] flex items-center justify-center text-xs text-white font-bold">
                                                {member.user.image ? <img src={member.user.image} className="rounded-full" /> : (member.user.name?.[0] || "U")}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Invite (Placeholder for now) */}
                                    <div className="flex gap-2">
                                        <Input placeholder="Invite by email (Coming Soon)" disabled className="bg-white/5 text-muted-foreground border-white/5" />
                                        <Button variant="secondary" disabled>Invite</Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
