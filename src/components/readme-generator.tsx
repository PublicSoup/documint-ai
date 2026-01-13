"use client";

import { useState, useEffect } from "react";
import {
    BookOpen, Loader2, X, Settings, Sparkles, Download,
    Eye, Copy, Check, Crown, Palette, Link2, FileText,
    ChevronDown, ChevronUp
} from "lucide-react";

interface ReadmeTemplate {
    id: string;
    name: string;
    description: string;
    premium: boolean;
}

interface SectionOption {
    id: string;
    name: string;
    default: boolean;
}

interface ReadmeGeneratorProps {
    fileIds: string[];
    onClose?: () => void;
}

import { useToast } from "./toast";

export default function ReadmeGenerator({ fileIds, onClose }: ReadmeGeneratorProps) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [stats, setStats] = useState<any>(null);

    // Template options
    const [templates, setTemplates] = useState<ReadmeTemplate[]>([]);
    const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
    const [badgeStyles, setBadgeStyles] = useState<string[]>([]);
    const [licenses, setLicenses] = useState<string[]>([]);

    // User selections
    const [selectedTemplate, setSelectedTemplate] = useState("standard");
    const [projectName, setProjectName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedBadgeStyle, setSelectedBadgeStyle] = useState("flat");
    const [selectedLicense, setSelectedLicense] = useState("MIT");
    const [author, setAuthor] = useState("");
    const [sections, setSections] = useState<Record<string, boolean>>({});
    const [badgesEnabled, setBadgesEnabled] = useState(true);
    const [tableOfContents, setTableOfContents] = useState(true);
    const [aiEnhanced, setAiEnhanced] = useState(true);
    const [codeExamples, setCodeExamples] = useState(true);

    // Social links
    const [github, setGithub] = useState("");
    const [twitter, setTwitter] = useState("");
    const [discord, setDiscord] = useState("");
    const [website, setWebsite] = useState("");

    // Branding
    const [logo, setLogo] = useState("");
    const [banner, setBanner] = useState("");

    // Load available options on mount
    useEffect(() => {
        const loadOptions = async () => {
            try {
                const res = await fetch("/api/generate-readme");
                if (res.ok) {
                    const data = await res.json();
                    setTemplates(data.templates || []);
                    setSectionOptions(data.sections || []);
                    setBadgeStyles(data.badgeStyles || []);
                    setLicenses(data.licenses || []);

                    // Initialize sections from defaults
                    const defaultSections: Record<string, boolean> = {};
                    data.sections?.forEach((s: SectionOption) => {
                        defaultSections[s.id] = s.default;
                    });
                    setSections(defaultSections);
                }
            } catch (e) {
                console.error("Failed to load options:", e);
            }
        };
        loadOptions();
    }, []);

    const handleGenerate = async () => {
        setGenerating(true);
        setPreview(null);

        try {
            const options = {
                style: selectedTemplate,
                projectName: projectName || undefined,
                description: description || undefined,
                author: author || undefined,
                license: selectedLicense,
                badges: {
                    enabled: badgesEnabled,
                    style: selectedBadgeStyle,
                    license: true,
                    version: true,
                    build: true,
                    coverage: selectedTemplate === "comprehensive" || selectedTemplate === "enterprise",
                },
                sections,
                social: (github || twitter || discord || website) ? {
                    github: github || undefined,
                    twitter: twitter || undefined,
                    discord: discord || undefined,
                    website: website || undefined,
                } : undefined,
                branding: (logo || banner) ? {
                    logo: logo || undefined,
                    banner: banner || undefined,
                } : undefined,
                includeTableOfContents: tableOfContents,
                includeBackToTop: true,
                codeExamples,
                aiEnhanced,
            };

            const res = await fetch("/api/generate-readme", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileIds, options }),
            });

            if (res.ok) {
                const data = await res.json();
                setPreview(data.readme);
                setStats(data.stats);
                toast("README generated!", "success");
            } else {
                toast("Failed to generate README", "error");
            }
        } catch (e) {
            console.error(e);
            toast("Error generating README", "error");
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
        a.download = `${projectName || "README"}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleCopy = () => {
        if (!preview) return;
        navigator.clipboard.writeText(preview);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleSection = (id: string) => {
        setSections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    if (!isOpen) {
        return (
            <div className="mt-4 pt-4 border-t">
                <button
                    onClick={() => setIsOpen(true)}
                    disabled={fileIds.length === 0}
                    className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                >
                    <Sparkles className="w-4 h-4" />
                    Generate Custom README
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">
                    {fileIds.length} file{fileIds.length !== 1 ? "s" : ""} selected
                </p>
            </div>
        );
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                onClick={() => { setIsOpen(false); onClose?.(); }}
            />

            {/* Modal */}
            <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[900px] md:max-h-[85vh] bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-purple-50 to-pink-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900">README Generator</h2>
                            <p className="text-sm text-gray-500">Create professional documentation</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setIsOpen(false); onClose?.(); }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Left Column - Options */}
                        <div className="space-y-6">
                            {/* Template Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Template Style
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {templates.map(template => (
                                        <button
                                            key={template.id}
                                            onClick={() => setSelectedTemplate(template.id)}
                                            className={`p-3 rounded-xl border-2 text-left transition-all relative ${selectedTemplate === template.id
                                                ? "border-purple-500 bg-purple-50"
                                                : "border-gray-200 hover:border-gray-300"
                                                }`}
                                        >
                                            {template.premium && (
                                                <Crown className="w-4 h-4 text-amber-500 absolute top-2 right-2" />
                                            )}
                                            <p className="font-medium text-gray-900 text-sm">{template.name}</p>
                                            <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Project Info */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-gray-700">
                                    Project Details
                                </label>
                                <input
                                    type="text"
                                    placeholder="Project Name"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                                <textarea
                                    placeholder="Short description..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={2}
                                    className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Author Name"
                                        value={author}
                                        onChange={(e) => setAuthor(e.target.value)}
                                        className="px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    />
                                    <select
                                        value={selectedLicense}
                                        onChange={(e) => setSelectedLicense(e.target.value)}
                                        className="px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                                    >
                                        {licenses.map(lic => (
                                            <option key={lic} value={lic}>{lic}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Sections Toggle */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Sections to Include
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {sectionOptions.map(section => (
                                        <button
                                            key={section.id}
                                            onClick={() => toggleSection(section.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sections[section.id]
                                                ? "bg-purple-100 text-purple-700 border border-purple-200"
                                                : "bg-gray-100 text-gray-600 border border-gray-200"
                                                }`}
                                        >
                                            {sections[section.id] ? "✓ " : ""}{section.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Advanced Settings */}
                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                            >
                                <Settings className="w-4 h-4" />
                                Advanced Options
                                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {showAdvanced && (
                                <div className="space-y-4 p-4 bg-gray-50 rounded-xl">
                                    {/* Badge Style */}
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-2">
                                            <Palette className="w-3 h-3 inline mr-1" />
                                            Badge Style
                                        </label>
                                        <div className="flex gap-2">
                                            {badgeStyles.map(style => (
                                                <button
                                                    key={style}
                                                    onClick={() => setSelectedBadgeStyle(style)}
                                                    className={`px-3 py-1 text-xs rounded-lg ${selectedBadgeStyle === style
                                                        ? "bg-purple-500 text-white"
                                                        : "bg-white border text-gray-600"
                                                        }`}
                                                >
                                                    {style}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={badgesEnabled}
                                                onChange={(e) => setBadgesEnabled(e.target.checked)}
                                                className="rounded text-purple-500 focus:ring-purple-500"
                                            />
                                            <span className="text-sm text-gray-700">Show Badges</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={tableOfContents}
                                                onChange={(e) => setTableOfContents(e.target.checked)}
                                                className="rounded text-purple-500 focus:ring-purple-500"
                                            />
                                            <span className="text-sm text-gray-700">Table of Contents</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={aiEnhanced}
                                                onChange={(e) => setAiEnhanced(e.target.checked)}
                                                className="rounded text-purple-500 focus:ring-purple-500"
                                            />
                                            <span className="text-sm text-gray-700">AI Enhanced</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={codeExamples}
                                                onChange={(e) => setCodeExamples(e.target.checked)}
                                                className="rounded text-purple-500 focus:ring-purple-500"
                                            />
                                            <span className="text-sm text-gray-700">Code Examples</span>
                                        </label>
                                    </div>

                                    {/* Social Links */}
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-2">
                                            <Link2 className="w-3 h-3 inline mr-1" />
                                            Social Links (optional)
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                placeholder="GitHub URL"
                                                value={github}
                                                onChange={(e) => setGithub(e.target.value)}
                                                className="px-3 py-2 text-xs border rounded-lg"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Twitter URL"
                                                value={twitter}
                                                onChange={(e) => setTwitter(e.target.value)}
                                                className="px-3 py-2 text-xs border rounded-lg"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Discord URL"
                                                value={discord}
                                                onChange={(e) => setDiscord(e.target.value)}
                                                className="px-3 py-2 text-xs border rounded-lg"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Website URL"
                                                value={website}
                                                onChange={(e) => setWebsite(e.target.value)}
                                                className="px-3 py-2 text-xs border rounded-lg"
                                            />
                                        </div>
                                    </div>

                                    {/* Branding */}
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-2">
                                            <FileText className="w-3 h-3 inline mr-1" />
                                            Branding (optional)
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                placeholder="Logo URL"
                                                value={logo}
                                                onChange={(e) => setLogo(e.target.value)}
                                                className="px-3 py-2 text-xs border rounded-lg"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Banner URL"
                                                value={banner}
                                                onChange={(e) => setBanner(e.target.value)}
                                                className="px-3 py-2 text-xs border rounded-lg"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column - Preview */}
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                    <Eye className="w-4 h-4" />
                                    Preview
                                </label>
                                {preview && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCopy}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                                        >
                                            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                            {copied ? "Copied!" : "Copy"}
                                        </button>
                                        <button
                                            onClick={handleDownload}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                                        >
                                            <Download className="w-3 h-3" />
                                            Download
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 bg-gray-900 rounded-xl p-4 overflow-auto min-h-[400px]">
                                {generating ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <Loader2 className="w-8 h-8 animate-spin mb-3" />
                                        <p className="text-sm">Generating your README...</p>
                                        <p className="text-xs text-gray-500 mt-1">This may take a moment with AI enhancement</p>
                                    </div>
                                ) : preview ? (
                                    <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                                        {preview}
                                    </pre>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                                        <BookOpen className="w-12 h-12 mb-3 opacity-50" />
                                        <p className="text-sm">Configure options and click Generate</p>
                                        <p className="text-xs text-gray-600 mt-1">Preview will appear here</p>
                                    </div>
                                )}
                            </div>

                            {/* Stats */}
                            {stats && (
                                <div className="mt-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl">
                                    <div className="grid grid-cols-5 gap-2 text-center">
                                        <div>
                                            <p className="text-lg font-bold text-purple-600">{stats.files}</p>
                                            <p className="text-xs text-gray-500">Files</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-purple-600">{stats.lines?.toLocaleString()}</p>
                                            <p className="text-xs text-gray-500">Lines</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-purple-600">{stats.functions}</p>
                                            <p className="text-xs text-gray-500">Functions</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-purple-600">{stats.classes}</p>
                                            <p className="text-xs text-gray-500">Classes</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-purple-600">{stats.quality}%</p>
                                            <p className="text-xs text-gray-500">Quality</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                        {fileIds.length} file{fileIds.length !== 1 ? "s" : ""} will be analyzed
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => { setIsOpen(false); onClose?.(); }}
                            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium flex items-center gap-2 disabled:opacity-70 shadow-lg shadow-purple-500/25"
                        >
                            {generating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    Generate README
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
