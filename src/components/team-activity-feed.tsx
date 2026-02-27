"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Activity, Clock, FileText, ShieldCheck,
    UserPlus, Trash2, Edit, CheckCircle2,
    Loader2, AlertCircle, UserMinus, UserCheck,
    RefreshCw, AlertTriangle, Fingerprint,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface TeamActivity {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    details: Record<string, unknown>;
    createdAt: string;
    user?: {
        name: string | null;
        image: string | null;
        email: string | null;
    } | null;
}

const ACTION_MAP: Record<string, { label: string; icon: LucideIcon; color: string }> = {
    VERIFY: { label: "Verified documentation", icon: ShieldCheck, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    UNVERIFY: { label: "Removed verification", icon: ShieldCheck, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    UPDATE: { label: "Updated documentation", icon: Edit, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    APPROVE: { label: "Approved documentation", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    CREATE_FILE: { label: "Created new file", icon: FileText, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
    DELETE_FILE: { label: "Deleted file", icon: Trash2, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
    INVITE_MEMBER: { label: "Invited new member", icon: UserPlus, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
    ACCEPT_INVITE: { label: "Joined the team", icon: UserCheck, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    REMOVE_MEMBER: { label: "Removed a member", icon: UserMinus, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
    LEAVE_TEAM: { label: "Left the team", icon: UserMinus, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
    UPDATE_MEMBER_ROLE: { label: "Updated member role", icon: Fingerprint, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    TEAM_RESCAN: { label: "Performed project rescan", icon: RefreshCw, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
    INTENT_DRIFT_DETECTED: { label: "AI detected intent drift", icon: AlertTriangle, color: "text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]" },
    POLICY_ENFORCEMENT: { label: "Policy enforced", icon: ShieldCheck, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
};

export function TeamActivityFeed({ teamId }: { teamId: string }) {
    const [activities, setActivities] = useState<TeamActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchActivity = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`/api/teams/${teamId}/activity`, { signal });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                const message =
                    (typeof data.message === "string" && data.message) ||
                    (typeof data.error === "string" && data.error !== "ApiException" ? data.error : "") ||
                    "Failed to load activity";
                throw new Error(message);
            }

            setActivities(Array.isArray(data.logs) ? data.logs : []);
        } catch (requestError: unknown) {
            if (signal?.aborted) {
                return;
            }

            const message = requestError instanceof Error ? requestError.message : "Failed to load activity";
            setError(message);
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, [teamId]);

    useEffect(() => {
        const controller = new AbortController();

        if (teamId) {
            void fetchActivity(controller.signal);
        }

        return () => controller.abort();
    }, [teamId, fetchActivity]);

    if (loading) {
        return (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-700" />
                <p className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em]">Synchronizing Feed...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="py-8 px-4 flex flex-col items-center justify-center gap-3 text-center">
                <AlertCircle className="w-6 h-6 text-rose-500" />
                <p className="text-xs font-bold text-rose-300">{error}</p>
                <button
                    type="button"
                    onClick={() => {
                        void fetchActivity();
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (activities.length === 0) {
        return (
            <div className="py-12 text-center space-y-3 bg-white/[0.01] rounded-2xl border border-dashed border-white/5">
                <Clock className="w-8 h-8 text-zinc-800 mx-auto" />
                <p className="text-xs text-zinc-500 italic">No recent team activity recorded.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Project Activity</h3>
                </div>
                <span className="text-[10px] text-zinc-500 font-bold bg-white/5 px-2 py-0.5 rounded-full border border-white/5">Live</span>
            </div>

            <div className="space-y-2">
                {activities.map((activity) => {
                    const config = ACTION_MAP[activity.action] || { 
                        label: activity.action.replace(/_/g, " "), 
                        icon: Activity, 
                        color: "text-zinc-400 bg-white/5 border-white/10" 
                    };
                    const Icon = config.icon;

                    return (
                        <div key={activity.id} className="group relative pl-4 pb-4 border-l border-white/5 last:pb-0">
                            {/* Line Node */}
                            <div className="absolute left-[-4.5px] top-1 w-2 h-2 rounded-full bg-[#111111] border border-white/20 group-hover:border-primary/50 transition-colors" />
                            
                            <div className="flex items-start gap-3">
                                <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center border shrink-0",
                                    config.color
                                )}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-white truncate">
                                            {activity.user?.name || activity.user?.email || "System"}
                                        </p>
                                        <span className="text-[10px] text-zinc-600 whitespace-nowrap">
                                            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                                        </span>
                                    </div>
                                    
                                    <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed">
                                        {config.label} 
                                        {typeof activity.details?.fileName === "string" && (
                                            <span className="text-zinc-300 font-mono ml-1">[{activity.details.fileName}]</span>
                                        )}
                                        {activity.action === "UPDATE_MEMBER_ROLE" && typeof activity.details?.newRole === "string" && (
                                            <span className="text-primary font-bold ml-1">to {activity.details.newRole}</span>
                                        )}
                                        {activity.action === "POLICY_ENFORCEMENT" && typeof activity.details?.expiredCount === "number" && (
                                            <span className="text-amber-500 font-bold ml-1">({activity.details.expiredCount} docs)</span>
                                        )}
                                        {activity.action === "INTENT_DRIFT_DETECTED" && typeof activity.details?.reasoning === "string" && (
                                            <span className="text-rose-400/80 italic block mt-1 border-l border-rose-500/20 pl-2">
                                                {activity.details.reasoning}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <p className="text-[9px] text-zinc-600 text-center uppercase font-black tracking-widest pt-2">
                Event Horizon v2.0 &bull; Secure Audit Chain
            </p>
        </div>
    );
}
