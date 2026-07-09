"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Laptop, Loader2, Plus, Trash2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import {
    DEFAULT_LOCAL_MODEL_BASE_URL,
    clearLocalModelConfig,
    getLocalModelConfig,
    probeLocalModelServers,
    saveLocalModelConfig,
    testLocalModelConnection,
    type DetectedLocalServer,
    type LocalModelConfig,
} from "@/lib/local-model";

type ConnState = "idle" | "testing" | "ok" | "error";

export function LocalModelSettings() {
    const { toast } = useToast();
    const [saved, setSaved] = useState<LocalModelConfig | null>(null);
    const [expanded, setExpanded] = useState(false);

    const [baseUrl, setBaseUrl] = useState("");
    const [modelId, setModelId] = useState("");
    const [apiKey, setApiKey] = useState("");

    const [connState, setConnState] = useState<ConnState>("idle");
    const [connError, setConnError] = useState<string | null>(null);
    const [detected, setDetected] = useState<DetectedLocalServer[]>([]);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [showHelp, setShowHelp] = useState(false);
    const [saving, setSaving] = useState(false);

    // Only read the saved config to drive the collapsed "Configured" badge — do
    // NOT auto-fill or auto-test, so the panel never looks configured when it isn't.
    useEffect(() => {
        setSaved(getLocalModelConfig());
    }, []);

    /** Chat-capable models only — hide embedding models, which can't answer. */
    const chatModels = availableModels.filter((id) => !/embed/i.test(id));

    const runTest = async (config: LocalModelConfig) => {
        setConnState("testing");
        setConnError(null);
        setDetected([]);
        const result = await testLocalModelConnection(config);
        if (result.ok) {
            setConnState("ok");
            setAvailableModels(result.models);
        } else {
            setConnState("error");
            setConnError(result.error ?? "Could not connect.");
            // The wrong port is by far the most common miss — scan the ports the
            // popular local servers use and offer any that answer as a one-click fix.
            setDetected(await probeLocalModelServers(config.baseUrl));
        }
        return result;
    };

    const openConfigure = () => {
        setExpanded(true);
        setConnState("idle");
        setConnError(null);
        setDetected([]);
        if (saved) {
            // Editing an existing config — pre-fill it and fetch its loaded models.
            setBaseUrl(saved.baseUrl);
            setModelId(saved.modelId);
            setApiKey(saved.apiKey);
            void runTest(saved);
        } else {
            // Fresh setup — seed the common default as a starting point.
            setBaseUrl(DEFAULT_LOCAL_MODEL_BASE_URL);
            setModelId("");
            setApiKey("");
            setAvailableModels([]);
        }
    };

    const closeConfigure = () => {
        setExpanded(false);
        setConnState("idle");
        setConnError(null);
        setDetected([]);
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
            if (result.ok) setExpanded(false);
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = () => {
        clearLocalModelConfig();
        setSaved(null);
        setExpanded(false);
        setBaseUrl("");
        setModelId("");
        setApiKey("");
        setConnState("idle");
        setAvailableModels([]);
        toast("Local model configuration removed", "success");
    };

    return (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/40 overflow-hidden">
            {/* Collapsed header — mirrors the other provider cards. */}
            <div className="p-4 flex items-center justify-between gap-3">
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
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            {saved
                                ? saved.baseUrl + (saved.modelId ? ` · ${saved.modelId}` : "")
                                : "LM Studio, Ollama, or any OpenAI-compatible server — runs in your browser."}
                        </p>
                    </div>
                </div>

                {saved ? (
                    <div className="flex items-center gap-1 shrink-0">
                        {!expanded && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-zinc-300 hover:text-white"
                                onClick={openConfigure}
                            >
                                Edit
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8"
                            onClick={handleRemove}
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Remove
                        </Button>
                    </div>
                ) : (
                    !expanded && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-zinc-300 hover:text-white h-8 shrink-0"
                            onClick={openConfigure}
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Configure
                        </Button>
                    )
                )}
            </div>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                        Nothing here is sent to our servers — the config is stored only in this browser, and requests
                        go straight from your browser to the address below. The full AI Architect agent runs on it too
                        — file reads/writes, search, and commands still execute against your workspace.
                    </p>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Base URL</label>
                        <Input
                            type="url"
                            placeholder={DEFAULT_LOCAL_MODEL_BASE_URL}
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            autoFocus
                            className="bg-black/20 border-white/10 font-mono text-sm"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            Model{" "}
                            <span className="normal-case font-normal text-zinc-600">
                                {chatModels.length > 1
                                    ? "— several models loaded; pick which to use"
                                    : "(which loaded model to use; blank = server default)"}
                            </span>
                        </label>
                        {chatModels.length > 0 && (
                            <select
                                value={chatModels.includes(modelId) ? modelId : ""}
                                onChange={(e) => setModelId(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-md px-2.5 py-2 font-mono text-sm text-white outline-none focus:border-indigo-500/50"
                            >
                                <option value="">Server default (whatever&apos;s loaded)</option>
                                {chatModels.map((id) => (
                                    <option key={id} value={id}>{id}</option>
                                ))}
                            </select>
                        )}
                        <Input
                            type="text"
                            placeholder={chatModels.length > 0 ? "…or type a model id" : "e.g. qwen/qwen3-8b (blank = server default)"}
                            value={modelId}
                            onChange={(e) => setModelId(e.target.value)}
                            className="bg-black/20 border-white/10 font-mono text-sm"
                        />
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
                            <Button size="sm" variant="ghost" className="h-8 text-zinc-400" onClick={closeConfigure} disabled={saving}>
                                Cancel
                            </Button>
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
                            Connected{chatModels.length > 0 ? ` — ${chatModels.length} model(s) loaded` : ""}.
                        </p>
                    )}
                    {connState === "error" && connError && (
                        <p className="text-[11px] text-red-400">{connError}</p>
                    )}
                    {connState === "error" && detected.length > 0 && (
                        <div className="space-y-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-2.5">
                            <p className="text-[11px] font-medium text-emerald-300">
                                A local server IS running — just not at the address above:
                            </p>
                            {detected.map((hit) => (
                                <button
                                    key={hit.baseUrl}
                                    type="button"
                                    onClick={() => {
                                        setBaseUrl(hit.baseUrl);
                                        void runTest({ baseUrl: hit.baseUrl, modelId: modelId.trim(), apiKey: apiKey.trim() });
                                    }}
                                    className="flex w-full items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-left font-mono text-[11px] text-emerald-200 transition-colors hover:bg-emerald-500/20"
                                >
                                    <span className="truncate">{hit.baseUrl}</span>
                                    {hit.models.length > 0 && (
                                        <span className="ml-auto shrink-0 text-emerald-400/70">
                                            {hit.models.length} model{hit.models.length === 1 ? "" : "s"}
                                        </span>
                                    )}
                                    <span className="shrink-0 font-sans font-medium">Use →</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {showHelp && (
                        <div className="space-y-2 rounded-md border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-zinc-400">
                            <p>
                                <strong className="text-zinc-300">LM Studio:</strong> open the Developer tab, start the
                                Local Server, and turn on <strong className="text-zinc-300">Enable CORS</strong> — it&apos;s a
                                separate setting from &ldquo;Serve on Local Network&rdquo;, and it&apos;s the one that matters
                                here. Use the exact address LM Studio prints (default{" "}
                                <code className="text-zinc-300">http://localhost:1234/v1</code> — note the port).
                            </p>
                            <p>
                                <strong className="text-zinc-300">Ollama:</strong> start it with{" "}
                                <code className="text-zinc-300">OLLAMA_ORIGINS=*</code> set so it accepts browser requests,
                                then use <code className="text-zinc-300">http://localhost:11434/v1</code>.
                            </p>
                            <p>
                                No tunnel or port-forwarding needed — requests go from this browser to the server on the
                                same machine. If the browser asks for permission to access your local network, allow it.
                                Only works while that server is running on this device and this browser tab is open.
                            </p>
                            <p className="text-amber-300/80">
                                <strong className="text-amber-300">Safari won&apos;t work here.</strong> It blocks HTTPS pages
                                from reaching local http:// servers with no way to allow it. Use Chrome, Edge, Brave, or Arc
                                for a local model — or use OpenRouter, which runs in the cloud and needs no local server.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
