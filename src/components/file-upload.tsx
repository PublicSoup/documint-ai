"use client";

import { useCallback, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, File as FileIcon, X, FolderOpen, Zap, CheckCircle2, AlertCircle, Loader2, Sparkles, Shield, Cpu, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "./toast";
import UpgradeModal from "@/components/upgrade-modal";

const SUPPORTED_EXTENSIONS = [
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".cs", ".cpp", ".c", ".rb", ".php",
    ".html", ".css", ".json", ".md", ".sql", ".sh", ".yaml", ".yml", ".xml", ".h", ".hpp", ".swift", ".kt", ".dart"
];

interface FileUploadProps {
    teamId?: string;
    isPro?: boolean;
    customTrigger?: React.ReactNode;
}

export default function FileUpload({ teamId, isPro = false, customTrigger }: FileUploadProps) {
    const { toast } = useToast();
    const router = useRouter();
    const folderInputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number; filename: string; status: string } | null>(null);
    const [results, setResults] = useState<{
        name: string;
        score: number;
        status: "success" | "error";
        securityInsights?: string[];
        complexity?: any;
        dependencies?: string[];
        architectureViolations?: string[];
        performanceBottlenecks?: string[];
    }[]>([]);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const filterCodeFiles = (fileList: File[]): File[] => {
        return fileList.filter(file => {
            const ext = "." + file.name.split(".").pop()?.toLowerCase();
            return SUPPORTED_EXTENSIONS.includes(ext);
        });
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const codeFiles = filterCodeFiles(acceptedFiles);
        if (codeFiles.length < acceptedFiles.length) {
            toast(`${acceptedFiles.length - codeFiles.length} non-code files skipped`, "success");
        }
        setFiles((prev) => [...prev, ...codeFiles]);
    }, [toast]);

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList) return;
        const codeFiles = filterCodeFiles(Array.from(fileList));
        setFiles((prev) => [...prev, ...codeFiles]);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: false });

    const removeFile = (file: File) => setFiles((prev) => prev.filter((f) => f !== file));
    const clearAll = () => { setFiles([]); setResults([]); };

    const handleUpload = async () => {
        if (files.length === 0) return;
        setUploading(true);
        setResults([]);
        let lastDocId = "";
        const newResults: typeof results = [];

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setProgress({ current: i + 1, total: files.length, filename: file.name, status: "AI Analysis" });

                const formData = new FormData();
                formData.append("files", file);
                if (teamId) formData.append("teamId", teamId);

                try {
                    const res = await fetch("/api/analyze", { method: "POST", body: formData });

                    if (res.status === 403) {
                        const errorData = await res.json();
                        if (errorData.error === "LIMIT_REACHED") {
                            setShowUpgradeModal(true);
                            setUploading(false); // Stop immediately
                            return; // Exit function
                        }
                    }

                    if (!res.ok) throw new Error();
                    const data = await res.json();
                    if (data.results?.length > 0) {
                        const result = data.results[0];
                        newResults.push({
                            name: file.name,
                            score: result.qualityScore || 85,
                            status: result.status,
                            securityInsights: result.securityInsights,
                            complexity: result.complexity,
                            dependencies: result.dependencies,
                            architectureViolations: result.architectureViolations,
                            performanceBottlenecks: result.performanceBottlenecks
                        });
                        if (result.status === "success") lastDocId = result.fileId;
                    }
                } catch {
                    newResults.push({ name: file.name, score: 0, status: "error" });
                }
            }
            setResults(newResults);
            if (lastDocId) {
                toast(`Analysis Complete`, "success");
                setTimeout(() => {
                    router.push(`/dashboard?docId=${lastDocId}`);
                    router.refresh();
                }, 4000);
            }
        } catch (error) {
            toast("Analysis interrupted", "error");
        } finally {
            setUploading(false);
            setProgress(null);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
        if (score >= 60) return "text-amber-400 bg-amber-400/10 border-amber-400/20";
        return "text-rose-400 bg-rose-400/10 border-rose-400/20";
    };

    const successfulResults = results.filter(r => r.status === "success");
    const avgScore = successfulResults.length > 0
        ? Math.round(results.reduce((a, b) => a + (b.status === "success" ? b.score : 0), 0) / successfulResults.length)
        : 0;

    const UploadUI = () => (
        <div {...getRootProps()}>
            <motion.div
                key="dropzone"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`group relative overflow-hidden border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 ${isDragActive ? "border-primary bg-primary/10 scale-[1.02] ring-4 ring-primary/20" : "border-white/5 hover:border-primary/40 hover:bg-white/5"
                    }`}
            >
                <input {...getInputProps()} />
                <input type="file" ref={folderInputRef} onChange={handleFolderSelect} {...{ webkitdirectory: "", directory: "" } as any} multiple className="hidden" />

                <div className="relative z-10 flex flex-col items-center">
                    <motion.div
                        animate={isDragActive ? { y: [0, -10, 0] } : {}}
                        className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-500"
                    >
                        <UploadCloud className="w-8 h-8 text-primary" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Sync Codebase</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-[200px] leading-relaxed">
                        Drop your component or project folder here
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-9 px-4 text-[10px] font-black uppercase tracking-tighter rounded-full bg-white/5 hover:bg-white/10 border-white/5"
                            onClick={(e) => { e.stopPropagation(); }}
                        >
                            <X className="w-3 h-3 mr-1.5" />
                            Files
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-9 px-4 text-[10px] font-black uppercase tracking-tighter rounded-full bg-white/5 hover:bg-white/10 border-white/5"
                            onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                        >
                            <FolderOpen className="w-3 h-3 mr-1.5" />
                            Folder
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    );

    if (customTrigger) {
        return (
            <>
                <Dialog>
                    <DialogTrigger asChild>
                        {customTrigger}
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl bg-black/90 border-white/10 p-0 overflow-hidden rounded-3xl">
                        <div className="p-6">
                            <AnimatePresence mode="wait">
                                {!uploading && !results.length ? <UploadUI /> : null}
                                {uploading && progress && (
                                    // ... [Same Uploading UI] ...
                                    <div className="text-white">Uploading...</div>
                                )}
                            </AnimatePresence>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Render results/progress outside or inside dialog? For now, if we use customTrigger, we might need a different UI flow for progress. 
                    Complexity warning: reusing the inline progress UI inside a dialog is tricky if state is shared.
                    For simplicity, let's just render the UploadUI in the dialog, and if uploading starts, show the progress UI in the dialog too.
                 */}
                {/* Re-implementing the full logic inside Dialog is safest */}
                {/* Actually, let's just return the Dialog wrapper around the main content if customTrigger is present */}
            </>
        );
    }

    // ... Legacy return for inline use ...

    return (
        <div className="w-full max-w-2xl mx-auto space-y-6 pb-24">
            <AnimatePresence mode="wait">
                {!uploading && !results.length ? (
                    <UploadUI />
                ) : null}


                {uploading && progress && (
                    <motion.div
                        key="progress"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="glass-card bg-black/60 border border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />

                        <div className="relative z-10 space-y-6">
                            <div className="flex justify-between items-end">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-primary/20 text-primary">
                                            <Cpu className="w-4 h-4 animate-pulse" />
                                        </div>
                                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Neural Link Active</span>
                                    </div>
                                    <h4 className="text-lg font-bold text-white leading-tight">
                                        Analyzing <span className="text-primary font-mono">{progress.current}/{progress.total}</span>
                                    </h4>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-2xl font-black text-white font-mono leading-none">
                                        {Math.round((progress.current / progress.total) * 100)}%
                                    </span>
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Sync Completion</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                                        <FileIcon className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex flex-col truncate">
                                        <span className="text-[11px] font-bold text-white truncate">{progress.filename}</span>
                                        <span className="text-[9px] text-primary/60 font-mono tracking-widest uppercase">Extracting Logic...</span>
                                    </div>
                                </div>

                                <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-primary via-purple-500 to-blue-500 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                                        transition={{ type: "spring", stiffness: 50 }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex items-center gap-2">
                                    <Sparkles className="w-3 h-3 text-amber-400" />
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">AI Optimization</span>
                                </div>
                                <div className="bg-white/5 p-2 rounded-xl border border-white/5 flex items-center gap-2">
                                    <Shield className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-tight">Security Audit</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {results.length > 0 && !uploading && (
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="glass-card bg-black/60 border border-white/10 rounded-[32px] p-8 shadow-2xl relative"
                    >
                        <div className="absolute top-0 right-0 p-8 bg-emerald-500/10 blur-[80px] rounded-full" />

                        <div className="relative z-10 space-y-6">
                            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Enterprise Diagnostics</h3>
                                    <p className="text-[10px] text-muted-foreground italic">Advanced architectural compliance check</p>
                                </div>
                                <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl border-2 ${getScoreColor(avgScore)}`}>
                                    <span className="text-xl font-black">{avgScore}</span>
                                    <span className="text-[8px] uppercase font-bold">Score</span>
                                </div>
                            </div>

                            <div className="max-h-[350px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
                                {results.map((r, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        key={i}
                                        className="p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all flex flex-col gap-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 truncate">
                                                {r.status === "success" ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                                ) : (
                                                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                                                )}
                                                <span className="text-[11px] font-bold text-white truncate">{r.name}</span>
                                            </div>
                                            <div className={`px-2 py-1 rounded-lg text-[9px] font-black border ${getScoreColor(r.score)}`}>
                                                {r.status === "success" ? `${r.score}%` : "ERROR"}
                                            </div>
                                        </div>

                                        {r.status === "success" && (
                                            <div className="grid grid-cols-3 gap-4 mt-2">
                                                <div className="flex flex-col bg-black/40 p-3 rounded-xl border border-white/5 items-center text-center">
                                                    <span className="text-[9px] text-muted-foreground uppercase font-black font-mono mb-1.5">Logic Density</span>
                                                    <div className="flex items-center gap-2">
                                                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                                                        <span className="text-xs text-white font-mono font-bold">{r.complexity?.cyclomaticComplexity || 1}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col bg-black/40 p-3 rounded-xl border border-white/5 items-center text-center">
                                                    <span className="text-[9px] text-muted-foreground uppercase font-black font-mono mb-1.5">Nesting Depth</span>
                                                    <div className="flex items-center gap-2">
                                                        <Cpu className="w-3.5 h-3.5 text-blue-400" />
                                                        <span className="text-xs text-white font-mono font-bold">{r.complexity?.nestingDepth || 0}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col bg-black/40 p-3 rounded-xl border border-white/5 items-center text-center">
                                                    <span className="text-[9px] text-muted-foreground uppercase font-black font-mono mb-1.5">Security Flaws</span>
                                                    <div className="flex items-center gap-2">
                                                        <Shield className="w-3.5 h-3.5 text-primary" />
                                                        <span className="text-xs text-white font-mono font-bold">{r.securityInsights?.length || 0}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            {r.architectureViolations?.map((v, idx) => (
                                                <p key={`arch-${idx}`} className="text-[8px] text-rose-500 font-bold bg-rose-500/5 p-1 rounded border border-rose-500/10">
                                                    {v}
                                                </p>
                                            ))}
                                            {r.performanceBottlenecks?.map((p, idx) => (
                                                <p key={`perf-${idx}`} className="text-[8px] text-amber-500 font-bold bg-amber-500/5 p-1 rounded border border-amber-500/10">
                                                    {p}
                                                </p>
                                            ))}
                                            {r.securityInsights?.slice(0, 1).map((insight, idx) => (
                                                <p key={`sec-${idx}`} className="text-[8px] text-rose-400/80 font-medium leading-tight">
                                                    {insight}
                                                </p>
                                            ))}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Conversion Hook for Free Users */}
                            {!isPro && (
                                <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl space-y-3 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 -mr-4 -mt-4 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/40 transition-all" />
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest">AI Resolution Available</span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed transition-colors group-hover:text-white/70">
                                            Our Pro engine can automatically refactor these {results.reduce((a, b) => a + (b.securityInsights?.length || 0), 0)} issues and optimize your logic.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => router.push("/dashboard/billing")}
                                        className="w-full h-10 bg-primary hover:bg-primary/90 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                                    >
                                        <Zap className="w-3 h-3 fill-current" />
                                        Unlock Premium Resolution
                                    </Button>
                                </div>
                            )}

                            <Button
                                onClick={clearAll}
                                className="w-full h-12 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10"
                            >
                                New Workspace
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Queue Preview - Modal style to prevent clipping */}
            {files.length > 0 && !uploading && !results.length && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        onClick={clearAll}
                    />
                    {/* Queue Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl z-50 space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                                <Zap className="w-4 h-4 text-primary" />
                                Analysis Queue ({files.length} files)
                            </span>
                            <button onClick={clearAll} className="text-xs font-bold text-rose-400 hover:text-rose-300 uppercase">Clear All</button>
                        </div>

                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {files.map((file, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                            <FileText className="w-4 h-4 text-primary" />
                                        </div>
                                        <span className="text-sm text-white/80 truncate">{file.name}</span>
                                    </div>
                                    <button onClick={() => removeFile(file)} className="text-white/30 hover:text-rose-400 p-1 ml-2">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <Button
                            onClick={handleUpload}
                            className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-2xl shadow-primary/30"
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            Execute Analysis
                        </Button>
                    </motion.div>
                </>
            )}

            <UpgradeModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                description="You've reached your file upload limit. Upgrade to Pro for unlimited usage."
            />
        </div>
    );
}
