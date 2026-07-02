"use client";

import React, { useState, useEffect, useCallback } from "react";
import { KeyRound, Check, Loader2, Eye, EyeOff, ExternalLink, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

type AiKeyProvider = "google" | "anthropic" | "openai";

interface AiUsageData {
    queryCount: number;
    tokenCount: number;
    quota: number;
    hasApiKey: boolean;
    providers?: Record<AiKeyProvider, boolean>;
}

interface ProviderMeta {
    id: AiKeyProvider;
    name: string;
    description: string;
    placeholder: string;
    consoleUrl: string;
    consoleLabel: string;
}

const PROVIDERS: ProviderMeta[] = [
    {
        id: "google",
        name: "Google AI",
        description: "Gemini models",
        placeholder: "AIza...",
        consoleUrl: "https://aistudio.google.com/apikey",
        consoleLabel: "Google AI Studio",
    },
    {
        id: "anthropic",
        name: "Anthropic",
        description: "Claude models",
        placeholder: "sk-ant-...",
        consoleUrl: "https://platform.claude.com/settings/keys",
        consoleLabel: "Claude Console",
    },
    {
        id: "openai",
        name: "OpenAI",
        description: "GPT models (ChatGPT API)",
        placeholder: "sk-...",
        consoleUrl: "https://platform.openai.com/api-keys",
        consoleLabel: "OpenAI Platform",
    },
];

export function ApiKeyManager() {
    const { toast } = useToast();
    const confirm = useConfirm();
    const [loading, setLoading] = useState(true);
    const [usage, setUsage] = useState<AiUsageData | null>(null);
    const [editingProvider, setEditingProvider] = useState<AiKeyProvider | null>(null);
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [removingProvider, setRemovingProvider] = useState<AiKeyProvider | null>(null);

    const fetchStatus = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleSave = async (provider: AiKeyProvider) => {
        if (!apiKey.trim()) {
            toast("Please enter an API key", "error");
            return;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/user/api-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
            });

            if (res.ok) {
                toast("API key saved and verified", "success");
                setApiKey("");
                setEditingProvider(null);
                setShowKey(false);
                fetchStatus();
            } else {
                const err = await res.json();
                toast(err.error || "Failed to save API key", "error");
            }
        } catch {
            toast("Failed to save API key", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (provider: ProviderMeta) => {
        const confirmed = await confirm({
            title: `Remove ${provider.name} key`,
            description: `AI requests to ${provider.description} will fall back to your plan's shared quota.`,
            confirmLabel: "Remove",
            variant: "destructive",
        });
        if (!confirmed) return;

        setRemovingProvider(provider.id);
        try {
            const res = await fetch(`/api/user/api-key?provider=${provider.id}`, { method: "DELETE" });
            if (res.ok) {
                toast(`${provider.name} key removed`, "success");
                fetchStatus();
            } else {
                toast("Failed to remove API key", "error");
            }
        } catch {
            toast("Failed to remove API key", "error");
        } finally {
            setRemovingProvider(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
        );
    }

    const connected = usage?.providers ?? { google: usage?.hasApiKey ?? false, anthropic: false, openai: false };
    const hasAnyKey = Object.values(connected).some(Boolean);
    const queryCount = usage?.queryCount ?? 0;
    const quota = usage?.quota ?? 0;
    const remaining = quota === -1 ? "Unlimited" : Math.max(0, quota - queryCount);
    const percentUsed = quota > 0 ? Math.min(100, Math.round((queryCount / quota) * 100)) : 0;

    return (
        <div className="space-y-6">
            <p className="text-xs text-zinc-500">
                Connect a key from any provider below to run that provider&apos;s models on your own account,
                without your plan&apos;s AI limits. Keys are encrypted at rest and never shown again after saving.
            </p>

            {/* Provider rows */}
            <div className="space-y-3">
                {PROVIDERS.map((provider) => {
                    const isConnected = connected[provider.id];
                    const isEditing = editingProvider === provider.id;

                    return (
                        <div key={provider.id} className="rounded-lg border border-white/[0.06] bg-black/40 overflow-hidden">
                            <div className="p-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isConnected ? "bg-emerald-500/10" : "bg-white/5"}`}>
                                        <KeyRound className={`w-5 h-5 ${isConnected ? "text-emerald-400" : "text-zinc-500"}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-medium text-white">{provider.name}</h3>
                                            {isConnected && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                                                    <Check className="w-2.5 h-2.5" />
                                                    Connected
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-0.5 truncate">{provider.description}</p>
                                    </div>
                                </div>

                                {isConnected ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 shrink-0"
                                        onClick={() => handleRemove(provider)}
                                        disabled={removingProvider === provider.id}
                                    >
                                        {removingProvider === provider.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <>
                                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                                Remove
                                            </>
                                        )}
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-zinc-300 hover:text-white h-8 shrink-0"
                                        onClick={() => {
                                            setEditingProvider(isEditing ? null : provider.id);
                                            setApiKey("");
                                            setShowKey(false);
                                        }}
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1" />
                                        Add Key
                                    </Button>
                                )}
                            </div>

                            {isEditing && !isConnected && (
                                <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
                                    <div className="relative">
                                        <Input
                                            type={showKey ? "text" : "password"}
                                            placeholder={provider.placeholder}
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSave(provider.id);
                                            }}
                                            autoFocus
                                            className="bg-black/20 border-white/10 pr-10 font-mono text-sm"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowKey(!showKey)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                                            aria-label={showKey ? "Hide API key" : "Show API key"}
                                        >
                                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <a
                                            href={provider.consoleUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                        >
                                            Get a key from {provider.consoleLabel}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 text-zinc-400"
                                                onClick={() => {
                                                    setEditingProvider(null);
                                                    setApiKey("");
                                                }}
                                                disabled={saving}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="h-8"
                                                onClick={() => handleSave(provider.id)}
                                                disabled={saving || !apiKey.trim()}
                                            >
                                                {saving ? (
                                                    <>
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                                        Verifying...
                                                    </>
                                                ) : (
                                                    "Save Key"
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Shared-quota usage (only relevant while no key is connected) */}
            {!hasAnyKey && (
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
                            ? "Your plan includes 0 AI queries. Add your own API key or upgrade."
                            : `You have ${remaining} remaining AI queries this month on the shared quota.`}
                    </p>
                </div>
            )}
        </div>
    );
}
