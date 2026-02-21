"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Loader2, CheckCircle, XCircle, Users, ArrowRight, Sparkles, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface InviteDetails {
    teamName: string;
    email: string;
    role: string;
    expiresAt: string;
}

export default function AcceptInvitePage() {
    const { token } = useParams();
    const router = useRouter();
    const { data: session, status } = useSession();

    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ teamName: string; teamId: string } | null>(null);

    useEffect(() => {
        const fetchInvite = async () => {
            try {
                const res = await fetch(`/api/invites/${token}`);
                const data = await res.json();

                if (res.ok) {
                    setInvite(data);
                } else {
                    setError(data.error || "Invalid invitation");
                }
            } catch {
                setError("Failed to load invitation");
            } finally {
                setLoading(false);
            }
        };

        if (token) fetchInvite();
    }, [token]);

    const handleAccept = async () => {
        setAccepting(true);
        try {
            const res = await fetch(`/api/invites/${token}`, {
                method: "POST"
            });
            const data = await res.json();

            if (res.ok) {
                setSuccess({ teamName: data.teamName, teamId: data.teamId });
            } else {
                setError(data.error || "Failed to accept invitation");
            }
        } catch {
            setError("Something went wrong");
        } finally {
            setAccepting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center p-4">
                <div className="glass-card p-8 rounded-[2rem] border border-white/10 shadow-2xl max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                        <XCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-black text-white mb-2 tracking-tight">Invitation Error</h1>
                    <p className="text-white/60 mb-8">{error}</p>
                    <Button
                        className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-all"
                        onClick={() => router.push("/")}
                    >
                        Return Home
                    </Button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center p-4">
                <div className="glass-card p-8 rounded-[2rem] border border-white/10 shadow-2xl max-w-md w-full text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -z-10" />
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h1 className="text-2xl font-black text-white mb-2 tracking-tight italic uppercase">Welcome aboard!</h1>
                    <p className="text-white/60 mb-8 leading-relaxed">
                        You've successfully joined <strong className="text-emerald-400">{success.teamName}</strong>. Ready to start documenting?
                    </p>
                    <Button
                        onClick={() => router.push(`/dashboard?team=${success.teamId}`)}
                        className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 font-bold transition-all"
                    >
                        Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </div>
        );
    }

    const isEmailMismatch = !!(session && invite && session.user?.email?.toLowerCase() !== invite.email.toLowerCase());

    return (
        <div className="min-h-screen bg-[#030014] flex items-center justify-center p-4 selection:bg-primary/30 relative overflow-hidden">
            {/* Subtle static background */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />

            <div className="max-w-md w-full relative z-10">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 group">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20">
                            <Sparkles className="w-7 h-7 text-white" />
                        </div>
                        <span className="text-2xl font-black tracking-tighter text-white">
                            DOCUMINT <span className="text-primary italic">AI</span>
                        </span>
                    </div>
                </div>

                <div className="glass-card p-8 rounded-[2rem] border border-white/10 shadow-2xl relative">

                    <div className="mb-8 text-center">
                        <h2 className="text-3xl font-bold text-white tracking-tight">Team Invitation</h2>
                        <p className="mt-2 text-sm text-white/50 leading-relaxed font-medium">
                            Join your colleagues on the frontier of automated documentation.
                        </p>
                    </div>

                    {invite && (
                        <div className="space-y-3 mb-8">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 shadow-inner">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Team</span>
                                    <span className="font-bold text-white text-sm">{invite.teamName}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Role</span>
                                    <span className="font-bold text-primary text-sm uppercase tracking-tighter italic">{invite.role}</span>
                                </div>
                                <div className="flex justify-between items-center border-t border-white/5 pt-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Invited</span>
                                    <span className="text-white/70 text-xs font-medium">{invite.email}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {isEmailMismatch && (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6 flex gap-3 animate-in slide-in-from-top duration-300">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Email Mismatch</p>
                                <p className="text-[11px] text-white/60 leading-relaxed">
                                    You're logged in as <span className="text-white font-bold">{session.user?.email}</span>, but this invite was sent to <span className="text-white font-bold">{invite?.email}</span>.
                                    Please switch accounts to continue.
                                </p>
                            </div>
                        </div>
                    )}

                    {status === "loading" ? (
                        <div className="flex justify-center py-6">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    ) : session ? (
                        <div className="space-y-6">
                            <div className="text-center space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Authenticated As</p>
                                <p className="text-sm font-bold text-white/80">{session.user?.email}</p>
                            </div>

                            <Button
                                onClick={handleAccept}
                                disabled={accepting || isEmailMismatch}
                                className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20 font-bold transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                {accepting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Merging Identity...
                                    </>
                                ) : (
                                    <>
                                        Accept Invitation
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                )}
                            </Button>

                            {isEmailMismatch && (
                                <button
                                    onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
                                    className="w-full text-xs font-bold text-primary/60 hover:text-primary transition-colors uppercase tracking-widest py-2"
                                >
                                    Switch Account
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <p className="text-xs text-white/40 text-center italic">
                                Identity verification required to join team workspace.
                            </p>
                            <Button
                                onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
                                className="w-full h-12 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <Users className="w-4 h-4 mr-2 text-primary" />
                                Sign In to Continue
                            </Button>
                        </div>
                    )}
                </div>

                <p className="mt-8 text-center text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                    Secure Enterprise Documentation &bull; DocuMint AI
                </p>
            </div>
        </div>
    );
}
