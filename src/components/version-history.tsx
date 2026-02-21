"use client";

import { useState, useEffect } from "react";
import { History, RotateCcw, Eye, Clock, Loader2, X } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "./toast";
import { cn } from "@/lib/utils";
import { DiffViewer } from "./diff-viewer";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface Version {
    id: string;
    version: number;
    message: string | null;
    content?: string;
    createdAt: string;
    createdById: string | null;
}

interface VersionHistoryProps {
    fileId: string;
    onRollback?: (content: any) => void;
}

export function VersionHistory({ fileId, onRollback }: VersionHistoryProps) {
    const { toast } = useToast();
    const [versions, setVersions] = useState<Version[]>([]);
    const [loading, setLoading] = useState(true);
    const [rollingBack, setRollingBack] = useState<string | null>(null);
    
    // Diff state
    const [diffVersion, setDiffVersion] = useState<Version | null>(null);
    const [isDiffLoading, setIsDiffLoading] = useState(false);
    const [currentVersionContent, setCurrentVersionContent] = useState<string | null>(null);

    const fetchVersions = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/versions?fileId=${fileId}`);
            if (res.ok) {
                const data = await res.json();
                setVersions(data.versions || []);
            }
        } catch (error) {
            console.error("Failed to fetch versions:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (fileId) fetchVersions();
    }, [fileId]);

    const handleViewDiff = async (version: Version) => {
        setIsDiffLoading(true);
        setDiffVersion(version);
        
        try {
            // Fetch content for the selected version
            const res = await fetch(`/api/versions/${version.id}`);
            const data = await res.json();
            
            // If we don't have current version content, fetch it (v_latest)
            if (!currentVersionContent && versions.length > 0) {
                const currentRes = await fetch(`/api/versions/${versions[0].id}`);
                const currentData = await currentRes.json();
                setCurrentVersionContent(currentData.version.content);
            }
            
            setDiffVersion({ ...version, content: data.version.content });
            
        } catch (e) {
            toast("Failed to load version content", "error");
            setDiffVersion(null);
        } finally {
            setIsDiffLoading(false);
        }
    };

    const handleRollback = async (version: Version) => {
        if (!confirm(`Are you sure you want to rollback to version ${version.version}? This will create a new version of the current state before reverting.`)) {
            return;
        }

        setRollingBack(version.id);
        try {
            const res = await fetch(`/api/versions/${version.id}`, {
                method: "POST",
            });

            if (res.ok) {
                const data = await res.json();
                toast(`Rolled back to v${version.version}`, "success");
                
                const contentRes = await fetch(`/api/versions/${version.id}`);
                if (contentRes.ok) {
                    const contentData = await contentRes.json();
                    if (onRollback) {
                        try {
                            const parsed = JSON.parse(contentData.version.content);
                            onRollback(parsed);
                        } catch {
                            onRollback(contentData.version.content);
                        }
                    }
                }
                
                fetchVersions();
            } else {
                toast("Rollback failed", "error");
            }
        } catch (error) {
            toast("An unexpected error occurred", "error");
        } finally {
            setRollingBack(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
                <History className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Version History</h3>
            </div>

            {versions.length === 0 ? (
                <div className="text-center py-12 bg-white/[0.02] border border-dashed border-white/5 rounded-2xl">
                    <Clock className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No version history available for this file.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {versions.map((v, i) => (
                        <div 
                            key={v.id} 
                            className={cn(
                                "group p-4 rounded-2xl border transition-all",
                                i === 0 
                                    ? "bg-primary/5 border-primary/20" 
                                    : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                            )}
                        >
                            <div className="flex items-start justify-between">
                                <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "text-[10px] font-black px-1.5 py-0.5 rounded-md",
                                            i === 0 ? "bg-primary text-white" : "bg-zinc-800 text-zinc-400"
                                        )}>
                                            V{v.version}
                                        </span>
                                        {i === 0 && (
                                            <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">Current</span>
                                        )}
                                        <span className="text-[10px] text-zinc-500 font-medium">
                                            {new Date(v.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-white/80 font-medium line-clamp-2 leading-relaxed">
                                        {v.message || "No description provided"}
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleViewDiff(v)}
                                        className="h-8 px-2 text-zinc-400 hover:text-white gap-1.5 text-[10px] font-bold"
                                    >
                                        <Eye className="w-3 h-3" />
                                        Diff
                                    </Button>
                                    {i !== 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={rollingBack !== null}
                                            onClick={() => handleRollback(v)}
                                            className="h-8 px-2 text-primary hover:bg-primary/10 gap-1.5 text-[10px] font-bold"
                                        >
                                            {rollingBack === v.id ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <RotateCcw className="w-3 h-3" />
                                            )}
                                            Rollback
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            <p className="text-[9px] text-zinc-600 text-center uppercase font-bold tracking-widest pt-2">
                Snapshots are automatically created on every save.
            </p>

            <Dialog open={!!diffVersion} onOpenChange={(open) => !open && setDiffVersion(null)}>
                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col bg-[#0A0A0B] border-white/10 p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b border-white/10 shrink-0">
                        <DialogTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                                    <History className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">Version Comparison</h2>
                                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Comparing V{diffVersion?.version} with Current</p>
                                </div>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black/40">
                        {isDiffLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Calculating differences...</p>
                            </div>
                        ) : (
                            <DiffViewer 
                                oldValue={diffVersion?.content || ""} 
                                newValue={currentVersionContent || ""} 
                                filename={`Documentation v${diffVersion?.version}`}
                            />
                        )}
                    </div>

                    <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end gap-3 shrink-0">
                        <Button variant="ghost" onClick={() => setDiffVersion(null)} className="rounded-xl font-bold text-xs">
                            Close
                        </Button>
                        {diffVersion && versions[0] && diffVersion.id !== versions[0].id && (
                            <Button 
                                onClick={() => {
                                    handleRollback(diffVersion);
                                    setDiffVersion(null);
                                }}
                                className="rounded-xl font-bold text-xs px-6 shadow-lg shadow-primary/20"
                            >
                                Rollback to this Version
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
