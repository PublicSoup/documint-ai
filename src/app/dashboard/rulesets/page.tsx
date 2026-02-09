"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Download, Sparkles, Terminal, Cpu, Zap, Code2, Lock } from "lucide-react";
import { useEffect } from "react";

export default function RulesetGeneratorPage() {
    const [type, setType] = useState<"cursor" | "cline" | "gemini">("cursor");
    const [context, setContext] = useState("");
    const [requirements, setRequirements] = useState("");
    const [generatedRuleset, setGeneratedRuleset] = useState("");
    const [loading, setLoading] = useState(false);
    const [hasAccess, setHasAccess] = useState(true);

    useEffect(() => {
        fetch("/api/user/subscription")
            .then(res => res.json())
            .then(data => {
                // Access allowed on starter, pro, team
                setHasAccess(data.plan !== "free");
            });
    }, []);

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/rulesets/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, context, requirements })
            });
            const data = await res.json();
            if (data.ruleset) {
                setGeneratedRuleset(data.ruleset);
            }
        } catch (error) {
            console.error("Failed to generate", error);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedRuleset);
    };

    const downloadRuleset = () => {
        const filename = type === "cursor" ? ".cursorrules" : `${type}-rules.md`;
        const blob = new Blob([generatedRuleset], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="container mx-auto p-6 space-y-8 animate-fade-in pt-24 text-white">
            <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
                    AI Ruleset Generator
                </h1>
                <p className="text-muted-foreground text-lg">
                    Create custom engineering rules for Cursor, Cline, or Gemini to keep your AI in sync with your codebase.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Input Panel */}
                <Card className="glass-card">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            Configuration
                        </CardTitle>
                        <CardDescription>Tell the AI about your engineering standards</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Target Tool</label>
                            <div className="grid grid-cols-3 gap-2">
                                <ToolButton
                                    active={type === "cursor"}
                                    onClick={() => setType("cursor")}
                                    icon={<Code2 className="w-4 h-4" />}
                                    label="Cursor"
                                />
                                <ToolButton
                                    active={type === "cline"}
                                    onClick={() => setType("cline")}
                                    icon={<Terminal className="w-4 h-4" />}
                                    label="Cline"
                                />
                                <ToolButton
                                    active={type === "gemini"}
                                    onClick={() => setType("gemini")}
                                    icon={<Cpu className="w-4 h-4" />}
                                    label="Gemini"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Project Context</label>
                            <textarea
                                className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                placeholder="Describe your tech stack, folder structure, or project goals..."
                                value={context}
                                onChange={(e) => setContext(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Specific Requirements</label>
                            <textarea
                                className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                placeholder="e.g. Use Tailwind v4, no semi-colons, use functional components, always write unit tests..."
                                value={requirements}
                                onChange={(e) => setRequirements(e.target.value)}
                            />
                        </div>

                        {!hasAccess && (
                            <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-primary" />
                                    <span className="text-sm font-bold text-white uppercase tracking-tight">Pro Feature</span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    The AI Ruleset Generator is only available on <span className="text-white font-bold">Starter</span> plans and above.
                                </p>
                                <Button
                                    className="w-full h-9 bg-primary hover:bg-primary/90 text-[10px] font-black uppercase tracking-widest"
                                    onClick={() => window.location.href = "/dashboard/billing"}
                                >
                                    Upgrade Now
                                </Button>
                            </div>
                        )}

                        <Button
                            className="w-full relative overflow-hidden group py-6"
                            onClick={handleGenerate}
                            disabled={loading || !context || !hasAccess}
                            isLoading={loading}
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            Generate Ruleset
                        </Button>
                    </CardContent>
                </Card>

                {/* Output Panel */}
                <Card className="glass-card flex flex-col">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                        <div>
                            <CardTitle>Generated Prompt / Ruleset</CardTitle>
                            <CardDescription>Ready to use in your IDE</CardDescription>
                        </div>
                        {generatedRuleset && (
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy
                                </Button>
                                <Button variant="ghost" size="sm" onClick={downloadRuleset}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="flex-1 p-0 relative">
                        {generatedRuleset ? (
                            <textarea
                                className="w-full h-full min-h-[500px] bg-black/20 p-6 font-mono text-sm border-none focus:ring-0 resize-none text-gray-300"
                                readOnly
                                value={generatedRuleset}
                            />
                        ) : (
                            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-50">
                                <Code2 className="w-16 h-16" />
                                <p>Fill in the configuration to generate your custom AI rules</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-300 ${active
                ? "bg-primary/20 border-primary text-white shadow-[0_0_20px_-5px_rgba(124,58,237,0.5)]"
                : "bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:border-white/10"
                }`}
        >
            {icon}
            <span className="text-sm font-medium">{label}</span>
        </button>
    );
}
