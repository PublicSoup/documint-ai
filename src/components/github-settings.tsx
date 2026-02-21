"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Github, Loader2, CheckCircle2, Unlink } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { useToast } from "./toast";

export function GitHubSettings() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [connection, setConnection] = useState<{ connected: boolean; username?: string; avatarUrl?: string } | null>(null);
    const [disconnecting, setDisconnecting] = useState(false);

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch("/api/github/repos");
            const data = await res.json();
            if (data.connected) {
                const username = data.repos?.[0]?.full_name?.split('/')[0] || undefined;
                setConnection({ connected: true, username });
            } else {
                setConnection({ connected: false });
            }
        } catch {
            setConnection({ connected: false });
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = () => {
        window.location.href = "/api/github/connect";
    };

    const handleDisconnect = async () => {
        setDisconnecting(true);
        try {
            const res = await fetch("/api/github/disconnect", { method: "POST" });
            if (res.ok) {
                setConnection({ connected: false });
                toast("GitHub disconnected", "success");
            }
        } catch {
            toast("Failed to disconnect", "error");
        } finally {
            setDisconnecting(false);
        }
    };

    if (loading) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

    return (
        <Card className="glass-card border-white/5 overflow-hidden">
            <CardHeader className="pb-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/10 shadow-lg">
                            <Github className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-base font-bold text-white">GitHub Integration</CardTitle>
                            <CardDescription className="text-xs">Connect your repositories to DocuMint AI</CardDescription>
                        </div>
                    </div>
                    {connection?.connected ? (
                        <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Linked</span>
                        </div>
                    ) : (
                        <div className="px-2.5 py-1 rounded-full bg-zinc-500/10 border border-zinc-500/20 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Not Connected</span>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
                {connection?.connected ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 shadow-inner">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-zinc-700 border-2 border-primary/20 flex items-center justify-center overflow-hidden">
                                    {connection.avatarUrl ? (
                                        <Image
                                            src={connection.avatarUrl}
                                            alt={connection.username || "GitHub avatar"}
                                            width={48}
                                            height={48}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <Github className="w-6 h-6 text-white/50" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">@{connection.username}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">GitHub Account Linked</p>
                                </div>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleDisconnect}
                                disabled={disconnecting}
                                className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-400/10 gap-2 font-bold"
                            >
                                {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />}
                                Disconnect
                            </Button>
                        </div>
                        
                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                            <p className="text-xs text-white/70 leading-relaxed">
                                <CheckCircle2 className="w-3 h-3 inline mr-2 text-primary" />
                                You can now import code directly from your GitHub repositories and push documentation as Pull Requests.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h4 className="text-sm font-bold text-white">Automate your workflow</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Linking your GitHub account allows DocuMint AI to watch for code changes, detect drift, and automatically suggest documentation updates.
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex gap-3">
                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-[11px] text-white/60">Import private & public repositories</span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex gap-3">
                                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-[11px] text-white/60">Auto-push docs as Pull Requests</span>
                            </div>
                        </div>

                        <Button 
                            onClick={handleConnect}
                            className="w-full h-12 bg-white text-black hover:bg-zinc-200 rounded-xl font-black uppercase tracking-widest gap-2"
                        >
                            <Github className="w-5 h-5" />
                            Connect GitHub Account
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
