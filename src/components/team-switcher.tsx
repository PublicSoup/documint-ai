"use client";

import { useState } from "react";
import { Users, ChevronDown, Check, Plus, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import CreateTeamModal from "./create-team-modal";

interface Team {
    id: string;
    name: string;
    plan: string;
}

interface TeamSwitcherProps {
    teams: Team[];
    currentTeamId?: string;
}

export default function TeamSwitcher({ teams, currentTeamId }: TeamSwitcherProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Find current active context
    const currentTeam = teams.find(t => t.id === currentTeamId);
    const isPersonal = !currentTeamId;

    const handleSwitch = (teamId: string | null) => {
        setIsOpen(false);
        const params = new URLSearchParams(searchParams.toString());
        if (teamId) {
            params.set("teamId", teamId);
        } else {
            params.delete("teamId");
        }

        // Remove docId when switching context to avoid "not found" errors
        params.delete("docId");

        router.push(`/dashboard?${params.toString()}`);
    };

    return (
        <>
            <div className="relative mb-6">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between p-3 glass border border-white/10 rounded-xl hover:border-white/20 transition-colors shadow-sm"
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPersonal ? 'bg-blue-500/20' : 'bg-purple-500/20'}`}>
                            {isPersonal ? (
                                <User className="w-5 h-5 text-blue-600" />
                            ) : (
                                <Users className="w-5 h-5 text-purple-600" />
                            )}
                        </div>
                        <div className="text-left">
                            <div className="text-xs text-white/40 font-medium tracking-wide text-uppercase">
                                {isPersonal ? "Personal Account" : "Team Workspace"}
                            </div>
                            <div className="text-sm font-bold text-white truncate max-w-[140px]">
                                {isPersonal ? "My Files" : currentTeam?.name}
                            </div>
                        </div>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 glass-card border border-white/10 bg-[#0A0A0B]/95 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-2 border-b border-white/10 bg-white/5">
                            <span className="text-xs font-semibold text-white/40 px-2 uppercase tracking-wider">
                                Switch Account
                            </span>
                        </div>

                        <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                            {/* Personal Account Option */}
                            <button
                                onClick={() => handleSwitch(null)}
                                className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${isPersonal ? 'bg-blue-500/20 text-blue-300' : 'hover:bg-white/10 text-white/80'}`}
                            >
                                <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                    <User className="w-3 h-3 text-blue-600" />
                                </div>
                                <span className="flex-1 text-left font-medium">Personal Account</span>
                                {isPersonal && <Check className="w-4 h-4" />}
                            </button>

                            {/* Teams List */}
                            {teams.map(team => {
                                const isActive = team.id === currentTeamId;
                                return (
                                    <button
                                        key={team.id}
                                        onClick={() => handleSwitch(team.id)}
                                        className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-white/10 text-white/80'}`}
                                    >
                                        <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                                            <Users className="w-3 h-3 text-purple-600" />
                                        </div>
                                        <span className="flex-1 text-left font-medium truncate">{team.name}</span>
                                        {isActive && <Check className="w-4 h-4" />}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="p-2 border-t border-white/10 bg-white/5">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setShowCreateModal(true);
                                }}
                                className="w-full flex items-center gap-2 p-2 rounded-lg text-sm font-medium text-white/60 hover:bg-white/5 hover:text-blue-400 hover:shadow-sm border border-transparent hover:border-white/10 transition-all"
                            >
                                <Plus className="w-4 h-4" />
                                Create New Team
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showCreateModal && <CreateTeamModal onClose={() => setShowCreateModal(false)} />}
        </>
    );
}
