"use client";

import { useState, useEffect } from "react";
import { Key, Copy, RefreshCw, Loader2, Check, Eye, EyeOff, Terminal, Shield } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { useToast } from "./toast";

export function ApiKeySettings() {
    const { toast } = useToast();
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchKey();
    }, []);

    const fetchKey = async () => {
        try {
            const res = await fetch("/api/user/api-key");
            if (res.ok) {
                const data = await res.json();
                setApiKey(data.apiKey);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        const confirmMsg = apiKey 
            ? "Are you sure you want to rotate your API key? Any existing applications using the old key will stop working immediately."
            : "Generate your first API key to access DocuMint via CLI and external integrations.";
            
        if (!confirm(confirmMsg)) return;

        setGenerating(true);
        try {
            const res = await fetch("/api/user/api-key", { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                setApiKey(data.apiKey);
                setShowKey(true);
                toast("API Key generated successfully", "success");
            }
        } catch (e) {
            toast("Failed to generate API Key", "error");
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = () => {
        if (!apiKey) return;
        navigator.clipboard.writeText(apiKey);
        setCopied(true);
        toast("Copied to clipboard", "success");
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

    return (
        <Card className="glass-card border-white/5 overflow-hidden">
            <CardHeader className="bg-white/[0.02] border-b border-white/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/10 shadow-lg">
                            <Terminal className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-base font-bold text-white">API Access</CardTitle>
                            <CardDescription className="text-xs text-zinc-500 font-medium">Integrate DocuMint AI into your CI/CD pipeline</CardDescription>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
                <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                        <div className="flex items-start gap-3">
                            <Shield className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-indigo-100/70 leading-relaxed font-medium">
                                Keep your API keys secret. Do not share them or commit them to source control. 
                                We recommend using environment variables or a secret manager.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Active API Key</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1 group">
                                <Input 
                                    readOnly
                                    type={showKey ? "text" : "password"}
                                    value={apiKey || "••••••••••••••••••••••••••••••••"}
                                    className="bg-black/40 border-white/10 text-white h-12 rounded-xl font-mono text-xs pr-12"
                                />
                                {apiKey && (
                                    <button 
                                        onClick={() => setShowKey(!showKey)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                                    >
                                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                )}
                            </div>
                            <Button 
                                variant="outline"
                                onClick={handleCopy}
                                disabled={!apiKey}
                                className="h-12 w-12 p-0 bg-white/5 border-white/10 rounded-xl hover:bg-white/10 transition-all shadow-lg"
                            >
                                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button 
                            onClick={handleGenerate}
                            disabled={generating}
                            className="w-full h-11 bg-white text-black hover:bg-zinc-200 rounded-xl font-black uppercase tracking-widest gap-2 shadow-xl"
                        >
                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {apiKey ? "Rotate API Key" : "Generate API Key"}
                        </Button>
                    </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                    <h4 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1 mb-3">Quick Integration</h4>
                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] space-y-2 overflow-x-auto custom-scrollbar">
                        <p className="text-zinc-500"># Analyze a file via CLI</p>
                        <p className="text-white">
                            curl -X POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/analyze \
                        </p>
                        <p className="text-white">
                            &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-primary">YOUR_API_KEY</span>" \
                        </p>
                        <p className="text-white">
                            &nbsp;&nbsp;-d '&#123;"filename": "app.ts", "code": "..."&#125;'
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
