"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Layout, Save, X, Loader2 } from "lucide-react";

interface DocTemplate {
    id: string;
    name: string;
    content: string;
    description?: string;
    updatedAt: string;
}

import { useToast } from "./toast";

export function TemplateManager() {
    const { toast } = useToast();
    const [templates, setTemplates] = useState<DocTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [saving, setSaving] = useState(false);

    // New Template State
    const [newName, setNewName] = useState("");
    const [newContent, setNewContent] = useState("");
    const [newDescription, setNewDescription] = useState("");

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            const res = await fetch("/api/templates");
            const data = await res.json();
            if (data.templates) {
                setTemplates(data.templates);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newName || !newContent) return;

        setSaving(true);
        try {
            const res = await fetch("/api/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newName,
                    content: newContent,
                    description: newDescription
                }),
            });

            const data = await res.json();

            if (res.ok) {
                setTemplates([data.template, ...templates]);
                setIsCreating(false);
                setNewName("");
                setNewContent("");
                setNewDescription("");
                toast("Template created successfully", "success");
            } else {
                if (data.upgradeUrl) {
                    if (confirm(data.message + "\nGo to billing?")) {
                        window.location.href = data.upgradeUrl;
                    }
                } else {
                    toast(data.error || "Failed to create template", "error");
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this template?")) return;

        try {
            const res = await fetch(`/api/templates/${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                setTemplates(templates.filter(t => t.id !== id));
                toast("Template deleted", "success");
            } else {
                const data = await res.json();
                toast(data.error || "Failed to delete", "error");
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Custom Doc Templates</h3>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Template
                </button>
            </div>

            {isCreating && (
                <div className="bg-gray-50 border rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-start">
                        <h4 className="font-medium text-gray-900">Create New Template</h4>
                        <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Template Name</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="e.g., Simple Explanation"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                            <input
                                type="text"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="What is this template for?"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">System Prompt / Instructions</label>
                            <textarea
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none h-32"
                                placeholder="Instructions for the AI..."
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Explain to the AI how it should analyze the code and format the documentation.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={() => setIsCreating(false)}
                            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={!newName || !newContent || saving}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Template
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-8 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            ) : templates.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 border border-dashed rounded-xl">
                    <Layout className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No custom templates yet.</p>
                    <p className="text-gray-400 text-xs mt-1">create one to customize your documentation.</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {templates.map(template => (
                        <div key={template.id} className="p-4 border rounded-xl hover:border-purple-200 transition-colors bg-white flex justify-between items-start group">
                            <div className="flex gap-3">
                                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center shrink-0">
                                    <Layout className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900">{template.name}</h4>
                                    <p className="text-xs text-gray-500 line-clamp-1">{template.description}</p>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Updated {new Date(template.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(template.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
