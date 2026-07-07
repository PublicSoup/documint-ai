"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Laptop, Loader2, Trash2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
    DEFAULT_LOCAL_MODEL_BASE_URL,
    clearLocalModelConfig,
    getLocalModelConfig,
    saveLocalModelConfig,
    testLocalModelConnection,
    type LocalModelConfig,
} from "@/lib/local-model";

type ConnState = "idle" | "testing" | "ok" | "error";

export function LocalModelSettings() {
    const { toast } = useToast();
    const [baseUrl, setBaseUrl] = useState(DEFAULT_LOCAL_MODEL_BASE_URL);
    const [modelId, setModelId] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [saved, setSaved] = useState<LocalModelConfig | null>(null);
    const [connState, setConnState] = useState<ConnState>("idle");
    const [connError, setConnError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [showHelp, setShowHelp] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const existing = getLocalModelConfig();
        if (existing) {
            setSaved(existing);
            setBaseUrl(existing.baseUrl);
            setModelId(existing.modelId);
            setApiKey(existing.apiKey);
        }
    }, []);

    const runTest = async (config: LocalModelConfig) => {
        setConnState("testing");
        setConnError(null);
        const result = await testLocalModelConnection(config);
        if (result.ok) {
            setConnState("ok");
            setAvailableModels(result.models);
        } else {
            setConnState("error");
            setConnError(result.error ?? "Could not connect.");
        }
        return result;
    };

    const handleSave = async () => {
        if (!baseUrl.trim()) {
            toast("Enter the server's base URL", "error");
            return;
        }
        setSaving(true);
        try {
            const config: LocalModelConfig = { baseUrl: baseUrl.trim(), modelId: modelId.trim(), apiKey: apiKey.trim() };
            saveLocalModelConfig(config);
            setSaved(config);
            const result = await runTest(config);
            toast(
                result.ok ? "Local model saved and reachable" : "Saved — but the server isn't reachable yet",
                result.ok ? "success" : "error",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = () => {
        clearLocalModelConfig();
        setSaved(null);
        setBaseUrl(DEFAULT_LOCAL_MODEL_BASE_URL);
        setModelId("");
        setApiKey("");
        setConnState("idle");
        setAvailableModels([]);
        toast("Local model configuration removed", "success");
    };

    return (
        <div className="space-y-3 rounded-lg border border-dashed border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${saved ? "bg-emerald-500/10" : "bg-white/5"}`}>
                        <Laptop className={`w-5 h-5 ${saved ? "text-emerald-400" : "text-zinc-500"}`} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-white">Local Model</h3>
                            {saved && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                                    <Check className="w-2.5 h-2.5" />
                                    Configured
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            LM Studio, Ollama, or any OpenAI-compatible server — runs entirely in your browser.
                        </p>
                    </div>
                </div>
                {saved && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 shrink-0"
                        onClick={handleRemove}
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Remove
                    </Button>
                )}
            </div>

            <p className="text-[11px] leading-relaxed text-zinc-500">
                Nothing here is sent to our servers — the config is stored only in this browser, and requests go
                straight from your browser to the address below. The full AI Architect agent runs on it too — file
                reads/writes, search, and commands still execute against your workspace, the model just isn&apos;t
                one of ours.
            </p>

            <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Base URL</label>
                <Input
                    type="url"
                    placeholder={DEFAULT_LOCAL_MODEL_BASE_URL}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="bg-black/20 border-white/10 font-mono text-sm"
                />
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Model ID <span className="normal-case font-normal text-zinc-600">(optional — most local servers ignore this and serve whatever's loaded)</span>
                </label>
                <Input
                    type="text"
                    placeholder="e.g. llama-3.1-8b-instruct"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    list="local-model-suggestions"
                    className="bg-black/20 border-white/10 font-mono text-sm"
                />
                {availableModels.length > 0 && (
                    <datalist id="local-model-suggestions">
                        {availableModels.map((id) => (
                            <option key={id} value={id} />
                        ))}
                    </datalist>
                )}
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    API Key <span className="normal-case font-normal text-zinc-600">(optional — most local servers don&apos;t require one)</span>
                </label>
                <Input
                    type="password"
                    placeholder="Leave blank unless your server requires one"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="bg-black/20 border-white/10 font-mono text-sm"
                />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
                <button
                    type="button"
                    onClick={() => setShowHelp((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHelp ? "rotate-180" : ""}`} />
                    Setup help
                </button>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-zinc-400"
                        onClick={() => runTest({ baseUrl: baseUrl.trim(), modelId: modelId.trim(), apiKey: apiKey.trim() })}
                        disabled={connState === "testing" || !baseUrl.trim()}
                    >
                        {connState === "testing" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : connState === "ok" ? (
                            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        ) : connState === "error" ? (
                            <WifiOff className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                            <Wifi className="w-3.5 h-3.5" />
                        )}
                        <span className="ml-1.5">Test</span>
                    </Button>
                    <Button size="sm" className="h-8" onClick={handleSave} disabled={saving || !baseUrl.trim()}>
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                    </Button>
                </div>
            </div>

            {connState === "ok" && (
                <p className="text-[11px] text-emerald-400">
                    Connected{availableModels.length > 0 ? ` — ${availableModels.length} model(s) loaded` : ""}.
                </p>
            )}
            {connState === "error" && connError && (
                <p className="text-[11px] text-red-400">{connError}</p>
            )}

            {showHelp && (
                <div className="space-y-2 rounded-md border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-zinc-400">
                    <p>
                        <strong className="text-zinc-300">LM Studio:</strong> open the Developer tab, start the
                        Local Server, and enable CORS (required — browsers block cross-origin requests otherwise).
                        The default address is <code className="text-zinc-300">http://localhost:1234/v1</code>.
                    </p>
                    <p>
                        <strong className="text-zinc-300">Ollama:</strong> start it with{" "}
                        <code className="text-zinc-300">OLLAMA_ORIGINS=*</code> set so it accepts browser requests,
                        then use <code className="text-zinc-300">http://localhost:11434/v1</code>.
                    </p>
                    <p>
                        Only works while that server is running on this device and this browser tab is open — it
                        is never reachable from a different machine or browser.
                    </p>
                    <p>
                        The agent&apos;s tool calls are plain text instructions, not the OpenAI function-calling
                        API, so any chat model can drive them — but smaller/quantized models follow the format less
                        reliably. A capable instruction-tuned model (7B+) works best.
                    </p>
                </div>
            )}
        </div>
    );
}
