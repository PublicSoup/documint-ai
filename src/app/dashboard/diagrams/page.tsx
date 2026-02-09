"use client";

import { useState, useEffect } from "react";
import { DiagramViewer } from "@/components/diagram-viewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileCode2, GitBranch, Share2, Workflow, Activity } from "lucide-react";

export default function DiagramsPage() {
    const [files, setFiles] = useState<any[]>([]);
    const [selectedFile, setSelectedFile] = useState<string>("");
    const [diagramType, setDiagramType] = useState<string>("class");
    const [generatedCode, setGeneratedCode] = useState<string>("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        fetch("/api/files/list")
            .then(res => {
                if (!res.ok) throw new Error("Failed to fetch");
                return res.json();
            })
            .then(data => {
                if (data.files) setFiles(data.files);
            })
            .catch(err => console.error("Failed to fetch files", err))
            .finally(() => setLoading(false));
    }, []);

    const handleGenerate = async () => {
        if (!selectedFile) return;
        setLoading(true);
        setGeneratedCode("");

        try {
            const res = await fetch("/api/diagram/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId: selectedFile, type: diagramType })
            });
            const data = await res.json();
            if (data.diagram) {
                setGeneratedCode(data.diagram);
            } else {
                console.error(data.error);
            }
        } catch (e) {
            console.error("Generation failed", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-8 animate-fade-in pt-24 text-white">
            <div className="flex flex-col gap-2">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
                    Architecture Visualizer
                </h1>
                <p className="text-muted-foreground text-lg">
                    Transform your code into professional architecture diagrams instantly with AI.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Controls Sidebar */}
                <Card className="lg:col-span-1 glass-card h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <SettingsIcon className="w-5 h-5 text-primary" />
                            Configuration
                        </CardTitle>
                        <CardDescription>Customize your diagram</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Select File</label>
                            {files.length > 0 ? (
                                <select
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary outline-none text-white"
                                    value={selectedFile}
                                    onChange={(e) => setSelectedFile(e.target.value)}
                                >
                                    <option value="">-- Choose a file --</option>
                                    {files.map(f => (
                                        <option key={f.id} value={f.id} className="bg-zinc-900">{f.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="text-xs text-muted-foreground p-3 border border-dashed border-white/10 rounded-lg text-center">
                                    No files available. Please upload files in the Dashboard first.
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Diagram Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                <TypeButton
                                    active={diagramType === "class"}
                                    onClick={() => setDiagramType("class")}
                                    icon={<FileCode2 className="w-4 h-4" />}
                                    label={files.find(f => f.id === selectedFile)?.name?.endsWith(".json") ? "Schema" : "Class"}
                                />
                                <TypeButton
                                    active={diagramType === "sequence"}
                                    onClick={() => setDiagramType("sequence")}
                                    icon={<Activity className="w-4 h-4" />}
                                    label="Sequence"
                                />
                                <TypeButton
                                    active={diagramType === "flowchart"}
                                    onClick={() => setDiagramType("flowchart")}
                                    icon={<Workflow className="w-4 h-4" />}
                                    label={files.find(f => f.id === selectedFile)?.name?.endsWith(".json") ? "Hierarchy" : "Flow"}
                                />
                                <TypeButton
                                    active={diagramType === "er"}
                                    onClick={() => setDiagramType("er")}
                                    icon={<GitBranch className="w-4 h-4" />}
                                    label="Database"
                                />
                            </div>
                        </div>

                        <Button
                            className="w-full relative overflow-hidden group"
                            size="lg"
                            onClick={handleGenerate}
                            disabled={!selectedFile || loading}
                            isLoading={loading}
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                <Share2 className="w-4 h-4" />
                                Generate Diagram
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-primary to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Button>
                    </CardContent>
                </Card>

                {/* Main View Area */}
                <Card className="lg:col-span-3 glass-card min-h-[600px] flex flex-col">
                    <CardHeader className="border-b border-white/5 pb-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle>Preview</CardTitle>
                                <CardDescription>Interactive SVG rendering</CardDescription>
                            </div>
                            {generatedCode && (
                                <div className="text-xs font-mono bg-black/40 px-3 py-1 rounded text-green-400 border border-green-500/20">
                                    Generative Success
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 bg-black/20">
                        {generatedCode ? (
                            <div className="p-4 h-full">
                                <DiagramViewer code={generatedCode} type={diagramType} />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-50">
                                <Workflow className="w-16 h-16" />
                                <p>Select a file and click generate to visualize</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function TypeButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all ${active
                ? "bg-primary/20 border-primary text-white shadow-[0_0_15px_-3px_rgba(124,58,237,0.4)]"
                : "bg-black/20 border-white/5 text-gray-400 hover:bg-white/5 hover:border-white/10"
                }`}
        >
            {icon}
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}

function SettingsIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}
