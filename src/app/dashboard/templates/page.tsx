"use client";

import { useState, useEffect } from "react";
import {
    Layout, Plus, Search, FileText, Trash2,
    Edit, Loader2, Sparkles, Check, Clock, Globe,
    Lock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Template {
    id: string;
    name: string;
    description: string | null;
    content: string;
    isPublic: boolean;
    teamId: string | null;
    updatedAt: string;
}

export default function TemplatesPage() {
    const { toast } = useToast();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    
    // Editor State
    const [isEditing, setIsEditing] = useState(false);
    const [currentTemplate, setCurrentTemplate] = useState<Partial<Template> | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/templates");
            if (res.ok) {
                const data = await res.json();
                setTemplates(data.templates || []);
            }
        } catch (e) {
            console.error("Failed to fetch templates:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const handleSave = async () => {
        if (!currentTemplate?.name || !currentTemplate?.content) return;
        setSaving(true);
        try {
            const isNew = !currentTemplate.id;
            const url = isNew ? "/api/templates" : `/api/templates/${currentTemplate.id}`;
            const method = isNew ? "POST" : "PUT";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(currentTemplate)
            });

            if (res.ok) {
                toast(isNew ? "Template created" : "Template updated", "success");
                setIsEditing(false);
                setCurrentTemplate(null);
                fetchTemplates();
            } else {
                const err = await res.json();
                toast(err.error || "Failed to save template", "error");
            }
        } catch {
            toast("Error saving template", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/templates/${deleteTarget.id}`, { method: "DELETE" });
            if (res.ok) {
                setTemplates(prev => prev.filter(t => t.id !== deleteTarget.id));
                toast("Template deleted", "success");
            } else {
                toast("Failed to delete template", "error");
            }
        } catch {
            toast("Failed to delete template", "error");
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    const filtered = templates.filter(t => 
        t.name.toLowerCase().includes(search.toLowerCase()) || 
        t.description?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading && templates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                <p className="text-xs text-zinc-500 font-black uppercase tracking-widest">Loading Library...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">Doc Templates</h1>
                    <p className="text-muted-foreground text-sm font-medium">Standardize documentation across your entire codebase.</p>
                </div>
                {!isEditing && (
                    <Button 
                        onClick={() => {
                            setCurrentTemplate({ name: "", content: "", description: "" });
                            setIsEditing(true);
                        }}
                        className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl h-11 px-6 gap-2 shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" /> Create Template
                    </Button>
                )}
            </header>

            {isEditing ? (
                <Card className="glass-card border-white/10 animate-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                    <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">
                                {currentTemplate?.id ? "Edit Template" : "New AI Template"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="text-xs font-bold text-zinc-500">Cancel</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 font-bold text-xs px-4">
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1.5" />}
                                Save Template
                            </Button>
                        </div>
                    </div>
                    <CardContent className="p-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Template Name</label>
                                <Input 
                                    value={currentTemplate?.name || ""}
                                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                                    placeholder="e.g. Standard React Component"
                                    className="bg-black/40 border-white/10 text-white h-12 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1">Short Description</label>
                                <Input 
                                    value={currentTemplate?.description || ""}
                                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, description: e.target.value })}
                                    placeholder="Used for documenting functional components..."
                                    className="bg-black/40 border-white/10 text-white h-12 rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest px-1 flex items-center justify-between">
                                <span>AI System Instructions</span>
                                <span className="text-primary/60 lowercase italic font-medium">Explain how AI should format the docs</span>
                            </label>
                            <textarea 
                                value={currentTemplate?.content || ""}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, content: e.target.value })}
                                placeholder="e.g. Always include a 'Performance Considerations' section and use Mermaid sequence diagrams for complex logic flows."
                                className="w-full h-64 bg-black/40 border border-white/10 text-white text-sm p-4 rounded-2xl focus:ring-1 focus:ring-primary outline-none resize-none font-mono"
                            />
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Search & Stats */}
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative flex-1 group w-full">
                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-primary transition-colors" />
                            <Input 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search templates..."
                                className="bg-white/5 border-white/10 pl-12 h-12 rounded-xl text-white"
                            />
                        </div>
                    </div>

                    {filtered.length === 0 ? (
                        <Card className="glass-card border-white/5 h-[300px] flex items-center justify-center text-center">
                            <div className="space-y-4 max-w-sm">
                                <Layout className="w-12 h-12 text-zinc-800 mx-auto" />
                                <p className="text-sm text-zinc-500 italic">No templates found. Create your first team-wide standard today.</p>
                            </div>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filtered.map(template => (
                                <Card key={template.id} className="glass-card border-white/5 hover:border-white/10 transition-all group overflow-hidden">
                                    <div className="h-2 bg-gradient-to-r from-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <CardHeader className="pb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                                                <FileText className="w-4 h-4 text-primary" />
                                            </div>
                                            {template.isPublic ? (
                                                <Globe className="w-3 h-3 text-zinc-600" />
                                            ) : (
                                                <Lock className="w-3 h-3 text-zinc-600" />
                                            )}
                                        </div>
                                        <CardTitle className="text-white group-hover:text-primary transition-colors">{template.name}</CardTitle>
                                        <CardDescription className="line-clamp-2 text-xs h-8">{template.description || "No description provided."}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">
                                                <Clock className="w-3 h-3" />
                                                Updated {new Date(template.updatedAt).toLocaleDateString()}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => {
                                                        setCurrentTemplate(template);
                                                        setIsEditing(true);
                                                    }}
                                                    className="p-1.5 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-all"
                                                >
                                                    <Edit className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => setDeleteTarget(template)}
                                                    className="p-1.5 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-400 transition-all"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </>
            )}
            
            <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent className="glass-card border-white/10 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">Delete template</DialogTitle>
                        <DialogDescription>
                            This will permanently delete &ldquo;{deleteTarget?.name}&rdquo;. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-rose-600 hover:bg-rose-500 text-white"
                        >
                            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <p className="mt-8 text-center text-[10px] uppercase font-black tracking-[0.3em] text-white/10">
                Enterprise Knowledge Standardization &bull; DocuMint AI
            </p>
        </div>
    );
}
