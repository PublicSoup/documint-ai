"use client";

import { useState, useEffect } from "react";
import {
    Layout, Sparkles, Crown, Check, ArrowRight,
    Loader2, Download, Code, FileText,
    Globe, Terminal, Book
} from "lucide-react";

interface Template {
    id: string;
    name: string;
    description: string;
    icon: string;
    preview: string;
    premium: boolean;
    category: string;
}

const TEMPLATES: Template[] = [
    {
        id: "api-docs",
        name: "API Documentation",
        description: "REST API reference with endpoints, request/response examples",
        icon: "globe",
        preview: "# API Reference\n\n## Authentication\n\n## Endpoints\n\n### GET /users\n\n### POST /users",
        premium: false,
        category: "Technical"
    },
    {
        id: "cli-docs",
        name: "CLI Documentation",
        description: "Command-line tool docs with usage examples and flags",
        icon: "terminal",
        preview: "# CLI Reference\n\n## Installation\n\n## Commands\n\n### init\n\n### build",
        premium: false,
        category: "Technical"
    },
    {
        id: "library-docs",
        name: "Library Documentation",
        description: "Package/library documentation with examples",
        icon: "book",
        preview: "# MyLibrary\n\n## Installation\n\n## Quick Start\n\n## API\n\n### Classes\n\n### Functions",
        premium: false,
        category: "Technical"
    },
    {
        id: "sdk-docs",
        name: "SDK Documentation",
        description: "Full SDK reference with getting started guide",
        icon: "code",
        preview: "# SDK Documentation\n\n## Installation\n\n## Configuration\n\n## Examples\n\n## API Reference",
        premium: true,
        category: "Enterprise"
    },
    {
        id: "internal-docs",
        name: "Internal Docs",
        description: "Team-internal documentation with architecture details",
        icon: "filetext",
        preview: "# Internal Documentation\n\n## Architecture\n\n## Decisions\n\n## Runbooks",
        premium: true,
        category: "Enterprise"
    },
    {
        id: "tutorial",
        name: "Tutorial Format",
        description: "Step-by-step learning guide with explanations",
        icon: "sparkles",
        preview: "# Tutorial: Getting Started\n\n## Prerequisites\n\n## Step 1\n\n## Step 2\n\n## Next Steps",
        premium: true,
        category: "Educational"
    }
];

const CUSTOM_CATEGORY = "Custom";

interface DocumentationTemplatesProps {
    fileId: string;
    fileName: string;
    onApply?: (template: string) => void;
}

export default function DocumentationTemplates({ fileId, fileName, onApply }: DocumentationTemplatesProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [generating, setGenerating] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [customTemplates, setCustomTemplates] = useState<Template[]>([]);

    useEffect(() => {
        if (isOpen) {
            // Fetch custom templates
            fetch("/api/templates")
                .then(res => res.json())
                .then(data => {
                    if (data.templates) {
                        const formatted = data.templates.map((t: any) => ({
                            id: t.id,
                            name: t.name,
                            description: t.description || "Custom template",
                            icon: "layout",
                            preview: t.content,
                            premium: true,
                            category: CUSTOM_CATEGORY
                        }));
                        setCustomTemplates(formatted);
                    }
                })
                .catch(err => console.error("Failed to load templates", err));
        }
    }, [isOpen]);

    const allTemplates = [...TEMPLATES, ...customTemplates];

    const categories = ["all", "Technical", "Enterprise", "Educational", CUSTOM_CATEGORY];

    const filteredTemplates = selectedCategory === "all"
        ? allTemplates
        : allTemplates.filter(t => t.category === selectedCategory);

    const handleGenerate = async () => {
        if (!selectedTemplate) return;

        setGenerating(true);
        try {
            const res = await fetch("/api/generate-docs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileId,
                    options: {
                        template: selectedTemplate.id,
                        format: "markdown",
                        generateSummary: true,
                        includeExamples: true
                    }
                })
            });

            if (res.ok) {
                const data = await res.json();
                setPreview(data.documentation);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    const handleDownload = () => {
        if (!preview) return;
        const blob = new Blob([preview], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName.replace(/\.[^/.]+$/, "")}-docs.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getIcon = (iconName: string) => {
        switch (iconName) {
            case "globe": return <Globe className="w-5 h-5" />;
            case "terminal": return <Terminal className="w-5 h-5" />;
            case "book": return <Book className="w-5 h-5" />;
            case "code": return <Code className="w-5 h-5" />;
            case "filetext": return <FileText className="w-5 h-5" />;
            case "sparkles": return <Sparkles className="w-5 h-5" />;
            case "filetext": return <FileText className="w-5 h-5" />;
            case "sparkles": return <Sparkles className="w-5 h-5" />;
            case "layout": return <Layout className="w-5 h-5" />;
            default: return <Layout className="w-5 h-5" />;
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
            >
                <Layout className="w-4 h-4" />
                Templates
            </button>
        );
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-50"
                onClick={() => setIsOpen(false)}
            />

            {/* Modal */}
            <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[800px] md:max-h-[80vh] bg-white/5 border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-4 border-b bg-gradient-to-r from-purple-900/20 to-indigo-900/20">
                    <h2 className="font-bold text-lg text-zinc-100 flex items-center gap-2">
                        <Layout className="w-5 h-5 text-purple-600" />
                        Documentation Templates
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Choose a template for <span className="font-medium">{fileName}</span>
                    </p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Category Filter */}
                    <div className="flex gap-2 mb-6">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-3 py-1.5 text-sm rounded-full capitalize transition-colors ${selectedCategory === cat
                                    ? "bg-purple-500/20 text-purple-300"
                                    : "bg-white/5 text-zinc-400 hover:bg-white/10"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Templates Grid */}
                    <div className="grid md:grid-cols-2 gap-4">
                        {filteredTemplates.map(template => (
                            <button
                                key={template.id}
                                onClick={() => setSelectedTemplate(template)}
                                className={`p-4 rounded-xl border-2 text-left transition-all relative ${selectedTemplate?.id === template.id
                                    ? "border-purple-500 bg-purple-500/10"
                                    : "border-white/10 hover:border-white/20"
                                    }`}
                            >
                                {template.premium && (
                                    <Crown className="w-4 h-4 text-amber-500 absolute top-3 right-3" />
                                )}
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${selectedTemplate?.id === template.id
                                    ? "bg-purple-500 text-white"
                                    : "bg-white/5 text-zinc-400"
                                    }`}>
                                    {getIcon(template.icon)}
                                </div>
                                <h3 className="font-semibold text-zinc-100">{template.name}</h3>
                                <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                                <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-white/5 text-zinc-400 rounded">
                                    {template.category}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Preview */}
                    {selectedTemplate && (
                        <div className="mt-6 p-4 bg-gray-900 rounded-xl">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-gray-400 uppercase tracking-wide">
                                    Template Preview
                                </span>
                                {preview && (
                                    <button
                                        onClick={handleDownload}
                                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                                    >
                                        <Download className="w-3 h-3" />
                                        Download
                                    </button>
                                )}
                            </div>
                            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {preview || selectedTemplate.preview}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-white/5 flex items-center justify-between">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="px-4 py-2 text-zinc-400 hover:text-zinc-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={!selectedTemplate || generating}
                        className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium disabled:opacity-50"
                    >
                        {generating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                Apply Template
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </>
    );
}
