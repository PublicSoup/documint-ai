"use client";

import { useState, useEffect } from "react";
import { Trophy, Medal, Award, Star, Loader2, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaderboardEntry {
    userId: string;
    name: string;
    image: string | null;
    role: string;
    points: number;
    approvals: number;
    updates: number;
    creations: number;
}

export function TeamLeaderboard({ teamId }: { teamId: string }) {
    const [data, setData] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teams/${teamId}/leaderboard`);
                if (res.ok) {
                    const json = await res.json();
                    setData(json.leaderboard || []);
                }
            } catch (e) {
                console.error("Leaderboard fetch failed", e);
            } finally {
                setLoading(false);
            }
        };

        if (teamId) fetchLeaderboard();
    }, [teamId]);

    if (loading) {
        return (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
                <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest">Calculating Rank...</p>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="py-8 text-center text-zinc-600 text-xs italic border border-dashed border-white/5 rounded-2xl">
                No contributions recorded yet.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Top Contributors</h3>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 bg-white/5 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    Points System
                </div>
            </div>

            <div className="space-y-2">
                {data.map((entry, index) => {
                    const isTop3 = index < 3;
                    const RankIcon = index === 0 ? Medal : index === 1 ? Award : index === 2 ? Award : null;
                    const rankColor = index === 0 ? "text-amber-400" : index === 1 ? "text-zinc-300" : index === 2 ? "text-amber-600" : "text-zinc-600";

                    return (
                        <div 
                            key={entry.userId}
                            className={cn(
                                "flex items-center justify-between p-3 rounded-2xl transition-all border",
                                index === 0 ? "bg-amber-400/5 border-amber-400/20" : "bg-white/[0.02] border-white/5"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-6 text-center font-black text-xs">
                                    {RankIcon ? <RankIcon className={cn("w-4 h-4 mx-auto", rankColor)} /> : <span className={rankColor}>{index + 1}</span>}
                                </div>
                                <div className="h-8 w-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                    {entry.image ? (
                                        <img src={entry.image} alt={entry.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-[10px] font-bold">{entry.name[0].toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate">{entry.name}</p>
                                    <div className="flex items-center gap-2 text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
                                        <span>{entry.creations} Created</span>
                                        <span>•</span>
                                        <span>{entry.approvals} Verified</span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-sm font-black text-white italic tracking-tighter">{entry.points} XP</div>
                                <div className="text-[9px] text-zinc-600 uppercase font-bold tracking-widest">Score</div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-start gap-3">
                <Info className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                <p className="text-[9px] text-white/40 leading-relaxed uppercase tracking-tight">
                    Earn 15 XP for Approvals, 10 XP for New Documentation, and 5 XP for Updates.
                </p>
            </div>
        </div>
    );
}
