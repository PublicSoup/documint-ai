"use client";

import { useState } from "react";
import { FileText, Loader2, Download, Copy, Check, Sparkles, Crown } from "lucide-react";

interface ChangelogGeneratorProps {
    fileIds: string[];
}

export default function ChangelogGenerator({ fileIds }: ChangelogGeneratorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [changelog, setChangelog] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [format, setFormat] = useState("keepachangelog");
    const [includeDetails, setIncludeDetails] = useState(true);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const res = await fetch("/api/changelog/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileIds, format, includeDetails })
            });
            if (res.ok) {
                const data = await res.json();
                setChangelog(data.changelog);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = () => {
        if (changelog) {
            navigator.clipboard.writeText(changelog);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleDownload = () => {
        if (changelog) {
            const blob = new Blob([changelog], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "CHANGELOG.md";
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                disabled={fileIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
                <FileText className="w-4 h-4" />
                Changelog
                <Crown className="w-3 h-3 text-amber-500" />
            </button>
        );
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setIsOpen(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-4 border-b bg-gradient-to-r from-amber-50 to-orange-50">
                    <h2 className="font-bold text-zinc-100 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-amber-600" />
                        AI Changelog Generator
                        <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                            <Crown className="w-3 h-3" /> Pro
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Generate release notes from your documented code changes
                    </p>
                </div>

                {/* Options */}
                <div className="p-4 border-b bg-gray-50 space-y-3">
                    <div className="flex gap-3">
                        <select
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
                        >
                            <option value="keepachangelog">Keep a Changelog</option>
                            <option value="conventional">Conventional</option>
                            <option value="simple">Simple</option>
                        </select>
                        <label className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeDetails}
                                onChange={(e) => setIncludeDetails(e.target.checked)}
                                className="rounded text-amber-500"
                            />
                            <span className="text-sm text-gray-700">Include details</span>
                        </label>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {changelog ? (
                        <div className="bg-gray-900 rounded-xl p-4 min-h-[200px]">
                            <div className="flex justify-end gap-2 mb-3">
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white rounded"
                                >
                                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white rounded"
                                >
                                    <Download className="w-3 h-3" /> Download
                                </button>
                            </div>
                            <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap">
                                {changelog}
                            </pre>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                            <FileText className="w-12 h-12 mb-3 opacity-50" />
                            <p className="text-sm">Click Generate to create your changelog</p>
                            <p className="text-xs text-gray-400 mt-1">{fileIds.length} files will be analyzed</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex justify-between">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium flex items-center gap-2 disabled:opacity-70"
                    >
                        {generating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Sparkles className="w-4 h-4" />
                        )}
                        {generating ? "Generating..." : "Generate Changelog"}
                    </button>
                </div>
            </div>
        </>
    );
}
