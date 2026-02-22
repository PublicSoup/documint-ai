"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getProjectGraphMermaid, createDemoProject } from "@/app/dashboard/actions";
import { useRouter } from "next/navigation";
import { Loader2, Share2, Info, Upload, Sparkles, FileCode2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProBadge } from "@/components/ui/pro-badge";
import { FeatureGateOverlay } from "@/components/ui/feature-gate-overlay";

const DiagramViewer = dynamic(() => import("@/components/diagram-viewer").then(mod => mod.DiagramViewer), {
    ssr: false,
    loading: () => (
        <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground bg-zinc-950/20">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
            <p className="text-sm">Loading Visualization Engine...</p>
        </div>
    )
});

export function ArchitectureTab({ teamId }: { teamId?: string }) {
    const router = useRouter();
    const [mermaidCode, setMermaidCode] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [isRealData, setIsRealData] = useState(false);
    const [loadingDemo, setLoadingDemo] = useState(false);

    async function fetchGraph() {
        setLoading(true);
        try {
            const code = await getProjectGraphMermaid(teamId);
            if (!code || code.length < 50 || code.includes("Error") || code.includes("No source files")) {
                console.log("📊 [Architecture] Using sample diagram");
                setMermaidCode(getSampleDiagram());
                setIsRealData(false);
            } else {
                setMermaidCode(code);
                setIsRealData(true);
            }
        } catch (error) {
            console.error("Failed to load graph", error);
            setMermaidCode(getSampleDiagram());
            setIsRealData(false);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchGraph();
    }, [teamId]);

    async function handleLoadDemo() {
        setLoadingDemo(true);
        try {
            const result = await createDemoProject(teamId);
            if (result.success) {
                await fetchGraph();
            }
        } catch (e) {
            console.error("Failed to create demo project", e);
        } finally {
            setLoadingDemo(false);
        }
    }

    function getSampleDiagram(): string {
        return `flowchart TB
    subgraph Frontend["🎨 Frontend"]
        direction TB
        Dashboard["📊 Dashboard"]
        IDE["💻 Cloud IDE"]
        Auth["🔐 Auth Pages"]
    end
    
    subgraph Backend["⚙️ Backend API"]
        direction TB
        AuthAPI["Auth API"]
        FilesAPI["Files API"]
        AgentAPI["AI Agent API"]
        AuditAPI["Audit API"]
    end
    
    subgraph Services["🔧 Core Services"]
        direction TB
        AIProvider["Gemini AI"]
        Storage["Supabase Storage"]
        Database["PostgreSQL"]
    end
    
    Dashboard --> FilesAPI
    Dashboard --> AuditAPI
    IDE --> AgentAPI
    IDE --> FilesAPI
    Auth --> AuthAPI
    
    AuthAPI --> Database
    FilesAPI --> Storage
    FilesAPI --> Database
    AgentAPI --> AIProvider
    AuditAPI --> Database
    
    classDef frontend fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef backend fill:#10b981,stroke:#059669,color:#fff
    classDef services fill:#f59e0b,stroke:#d97706,color:#fff
    
    class Dashboard,IDE,Auth frontend
    class AuthAPI,FilesAPI,AgentAPI,AuditAPI backend
    class AIProvider,Storage,Database services`;
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
                <p>Analyzing Project Structure...</p>
                <p className="text-xs opacity-50 mt-2">Parsing imports and dependencies</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div>
                        <h3 className="text-lg font-medium text-white flex items-center gap-2">
                            Project Architecture
                            <ProBadge />
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Live visualization of your project's component and dependency graph.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isRealData && (
                        <div className="flex items-center gap-1.5 text-xs font-mono bg-emerald-500/10 px-3 py-1.5 rounded-lg text-emerald-400 border border-emerald-500/20">
                            <FileCode2 className="w-3 h-3" />
                            Live Data
                        </div>
                    )}
                    <Button variant="outline" size="sm" className="gap-2">
                        <Share2 className="w-4 h-4" />
                        Share
                    </Button>
                </div>
            </div>

            {/* Sample data notice with action buttons */}
            {!isRealData && (
                <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-300">
                    <Sparkles className="w-4 h-4" />
                    <AlertTitle>Sample Diagram</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                        <span>This is a sample visualization. Upload source files or load a demo project to see your real architecture.</span>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                onClick={handleLoadDemo}
                                disabled={loadingDemo}
                            >
                                {loadingDemo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                Load Demo Project
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                onClick={() => router.push('/dashboard')}
                            >
                                <Upload className="w-3 h-3" />
                                Upload Files
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            <FeatureGateOverlay isLocked={false} title="Architecture Visualization Locked" description="Upgrade to the Pro plan to visualize your project's structure and dependencies.">
                <div className="space-y-4">
                    {isRealData && (
                        <Alert className="bg-blue-500/10 border-blue-500/20 text-blue-300">
                            <Info className="w-4 h-4" />
                            <AlertTitle>Live Graph</AlertTitle>
                            <AlertDescription>
                                This diagram is auto-generated from your actual source code. Blue nodes are components, Green are pages, Orange are APIs.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-2xl bg-zinc-950/50">
                        <DiagramViewer
                            code={mermaidCode}
                            type="flowchart"
                            onNodeClick={(filePath) => {
                                console.log("🚀 [Architecture] Navigating to file:", filePath);
                                router.push(`/code?file=${encodeURIComponent(filePath)}`);
                            }}
                        />
                    </div>
                </div>
            </FeatureGateOverlay>
        </div>
    );
}

