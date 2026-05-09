"use client";

import React, { useState, useEffect } from "react";
import { KeyRound, Check, X, Loader2, Eye, EyeOff, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface AiUsageData {
    queryCount: number;
    tokenCount: number;
    quota: number;
    hasApiKey: boolean;
}

export function ApiKeyManager() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [usage, setUsage] = useState<AiUsageData | null>(null);
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [validating, setValidating] = useState(false);

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch("/api/user/api-key");
            if (res.ok) {
                const data = await res.json();
                setUsage(data.usage);
            }
        } catch {
            // Silent fail
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!apiKey.trim()) {
            toast.error("Please enter an API key");
            return;
        }

        setValidating(true);
        try {
            const res = await fetch("/api/user/api-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: apiKey.trim() }),
            });

            if (res.ok) {
                toast.success("API key saved successfully");
                setApiKey("");
                fetchStatus();
            } else {
                const err = await res.json();
                toast.error(err.error || "Failed to save API key");
            }
        } catch {
            toast.error("Failed to save API key");
        } finally {
            setValidating(false);
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!confirm("Remove your API key? You'll need to use the shared key quota or upgrade your plan.")) return;

        try {
            const res = await fetch("/api/user/api-key", { method: "DELETE" });
            if (res.ok) {
                toast.success("API key removed");
                fetchStatus();
            }
        } catch {
            toast.error("Failed to remove API key");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
        );
    }

    const hasKey = usage?.hasApiKey ?? false;
    const queryCount = usage?.queryCount ?? 0;
    const quota = usage?.quota ?? 0;
    const remaining = quota === -1 ? "Unlimited" : Math.max(0, quota - queryCount);
    const percentUsed = quota > 0 ? Math.min(100, Math.round((queryCount / quota) * 100)) : 0;

    return (
        <div className="space-y-6">
            {/* API Key Status */}
            <div className="p-4 rounded-lg border border-white/[0.06] bg-black/40">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasKey ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                            <KeyRound className={`w-5 h-5 ${hasKey ? "text-emerald-400" : "text-amber-400"}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-white">
                                {hasKey ? "API Key Connected" : "No API Key Set"}
                            </h3>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                {hasKey
                                    ? "Your own Google AI key is being used for AI features"
                                    : "Free users can add their own key to unlock unlimited AI features"}
                            </p>
                        </div>
                    </div>
                    {hasKey && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8"
                            onClick={handleRemove}
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Remove
                        </Button>
                    )}
                </div>
            </div>

            {/* Usage Stats */}
            {!hasKey && (
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-400">Monthly AI Usage</span>
                        <span className="text-zinc-300">
                            {queryCount} / {quota === -1 ? "∞" : quota} queries
                        </span>
                    </div>
                    {quota > 0 && (
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${
                                    percentUsed > 80 ? "bg-red-500" : percentUsed > 50 ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${percentUsed}%` }}
                            />
                        </div>
                    )}
                    <p className="text-xs text-zinc-500 mt-2">
                        {quota === 0
                            ? "Free plan includes 0 AI queries. Add your own API key or upgrade."
                            : `You have ${remaining} remaining AI queries this month.`}
                    </p>
                </div>
            )}

            {/* Key Input */}
            {!hasKey && (
                <div className="space-y-3">
                    <label className="text-sm text-zinc-400 font-medium">
                        Google AI Studio API Key
                    </label>
                    <div className="relative">
                        <Input
                            type={showKey ? "text" : "password"}
                            placeholder="AIza..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="bg-black/20 border-white/10 pr-20 font-mono text-sm"
                        />
                        <div className="absolute right-1 top-1 flex items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                            <ExternalLink className="w-3 h-3" />
                            Get a free API key
                        </a>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={!apiKey.trim() || saving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white h-8"
                        >
                            {validating ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                                    Validating...
                                </>
                            ) : (
                                <>
                                    <Check className="w-3.5 h-3.5 mr-1" />
                                    Save Key
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}

            {/* Info box */}
            <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                <p className="text-xs text-indigo-300/80">
                    Your API key is encrypted at rest using AES-256-GCM and is never exposed to other users.
                    Using your own key bypasses plan limits and gives you access to Gemini 2.0 Flash free tier.
                </p>
            </div>
        </div>
    );
}