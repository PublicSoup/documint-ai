"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "./toast";

import { useRouter } from "next/navigation";
import CodeArchaeology from "./code-archaeology";
import CommentsSection from "./comments-section";
import DocumentationTemplates from "./documentation-templates";
import DocSuggestions from "./doc-suggestions";
import { DiagramViewer } from "./diagram-viewer";
import { VerifiedBadge } from "./verified-badge";
import { FileText, Edit2, Play, Users, Sparkles, Download, GitBranch, Github, Shovel, Loader2, Workflow, Globe, Save, X, RefreshCw, Headphones, ShieldCheck } from "lucide-react";

interface DocEntity {
    type: string;
    name: string;
    code: string;
    doc: string;
    startLine: number;
    endLine: number;
}

interface DocContent {
    summary: string;
    entities: DocEntity[];
    qualityScore?: number;
    securityInsights?: string[];
    metadata?: {
        linesOfCode?: number;
        functions?: number;
        classes?: number;
        analyzedAt?: string;
    };
    verifiedAt?: string | null;
    verifiedById?: string | null;
}

interface DocEditorProps {
    fileId: string;
    fileName: string;
    fileLanguage: string;
    initialContent: DocContent;
    currentUser?: { id: string; name: string };
    isPublic: boolean;
}

export default function DocEditor({ fileId, fileName, fileLanguage, initialContent, isPublic: initialPublicState }: DocEditorProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regeneratingEntity, setRegeneratingEntity] = useState<number | null>(null);
    const [content, setContent] = useState<DocContent>(initialContent);
    const [verifying, setVerifying] = useState(false);
    const [isPublic, setIsPublic] = useState(initialPublicState);
    const [sharing, setSharing] = useState(false);

    // Persona states
    const [showPersonaModal, setShowPersonaModal] = useState(false);
    const [personaLoading, setPersonaLoading] = useState(false);
    const [personaExplanation, setPersonaExplanation] = useState<{ persona: string; text: string } | null>(null);

    // View Mode
    const [mode, setMode] = useState<"standard" | "archaeology" | "code">("standard");

    // GitHub Import State
    const [showGithubModal, setShowGithubModal] = useState(false);
    const [githubRepos, setGithubRepos] = useState<any[]>([]);
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [pushingToGithub, setPushingToGithub] = useState(false);

    // Diagram State
    const [showDiagramModal, setShowDiagramModal] = useState(false);
    const [diagramType, setDiagramType] = useState("class");
    const [diagramCode, setDiagramCode] = useState("");
    const [generatingDiagram, setGeneratingDiagram] = useState(false);

    // Translation State
    const [translating, setTranslating] = useState(false);
    const [currentLang, setCurrentLang] = useState("English");

    // Code View State
    const [rawContent, setRawContent] = useState<string | null>(null);
    const [loadingRaw, setLoadingRaw] = useState(false);

    // AI Architect State
    const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant" | "system"; content: string }[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [sendingChat, setSendingChat] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (mode === 'code') {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatHistory, sendingChat, mode]);

    useEffect(() => {
        if (mode === "code" && !rawContent) {
            const fetchRaw = async () => {
                setLoadingRaw(true);
                try {
                    const res = await fetch(`/api/files/${fileId}/raw`);

                    if (res.status === 402 || res.status === 403) {
                        toast("Code View is a Pro feature. Please upgrade.", "error");
                        setMode("standard");
                        // Optional: Redirect to billing or show upgrade modal
                        if (confirm("Code View is available on Pro & Team plans. Upgrade now?")) {
                            router.push("/dashboard/billing");
                        }
                        return;
                    }

                    if (res.ok) {
                        const data = await res.json();
                        setRawContent(data.content);
                    }
                } catch (e) {
                    console.error("Failed to load raw content", e);
                } finally {
                    setLoadingRaw(false);
                }
            };
            fetchRaw();
        }
    }, [mode, fileId, rawContent]);

    const handleSendChat = async () => {
        if (!chatInput.trim() || sendingChat) return;

        const userMsg = { role: "user" as const, content: chatInput };
        setChatHistory(prev => [...prev, userMsg]);
        setChatInput("");
        setSendingChat(true);

        try {
            const res = await fetch("/api/ai/architect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileId,
                    code: rawContent, // Code context
                    chatHistory: chatHistory.map(m => ({ role: m.role, content: m.content })), // Send history for memory
                    userPrompt: userMsg.content
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setChatHistory(prev => [...prev, { role: "assistant", content: data.response }]);
            } else {
                toast(data.error || "Failed to get response", "error");
            }
        } catch (e) {
            console.error(e);
            toast("Error communicating with AI Architect", "error");
        } finally {
            setSendingChat(false);
        }
    };


    const handleCancel = () => {
        setContent(initialContent);
        setIsEditing(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/docs/${fileId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            if (!res.ok) throw new Error("Failed to save");

            setIsEditing(false);
            router.refresh();
        } catch (error) {
            console.error("Save error:", error);
            toast("Failed to save changes", "error");
        } finally {
            setIsSaving(false);
        }
    };

    // Regenerate entire documentation with AI
    const handleRegenerate = async () => {
        setIsRegenerating(true);
        try {
            const res = await fetch(`/api/regenerate/${fileId}`, {
                method: "POST",
            });

            if (!res.ok) throw new Error("Failed to regenerate");

            const data = await res.json();
            if (data.content) {
                setContent(data.content);
            }
            router.refresh();
        } catch (error) {
            console.error("Regenerate error:", error);
            toast("Failed to regenerate documentation. AI service error.", "error");
        } finally {
            setIsRegenerating(false);
        }
    };

    // Regenerate single entity documentation
    const handleRegenerateEntity = async (index: number) => {
        setRegeneratingEntity(index);
        try {
            const entity = content.entities[index];
            const res = await fetch(`/api/regenerate-entity`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: entity.code,
                    language: fileLanguage,
                    type: entity.type,
                    name: entity.name,
                }),
            });

            if (!res.ok) throw new Error("Failed to regenerate entity");

            const data = await res.json();
            if (data.doc) {
                const newEntities = [...content.entities];
                newEntities[index] = { ...newEntities[index], doc: data.doc };
                setContent({ ...content, entities: newEntities });
            }
        } catch (error) {
            console.error("Regenerate entity error:", error);
            toast("Failed to regenerate. AI service error.", "error");
        } finally {
            setRegeneratingEntity(null);
        }
    };

    const handleDownload = () => {
        let md = `# ${fileName}\n\n`;
        md += `**Language:** ${fileLanguage}\n`;
        md += `**Generated By:** DocuMint AI (Gemini 2.0 Flash)\n\n`;
        md += `## Summary\n\n${content.summary}\n\n`;
        md += `## Detailed Analysis\n\n`;

        if (content.entities) {
            content.entities.forEach(entity => {
                md += `### ${entity.name} (${entity.type})\n\n`;
                md += `${entity.doc}\n\n`;
                md += "```" + fileLanguage + "\n";
                md += entity.code + "\n";
                md += "```\n\n";
            });
        }

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}-docs.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleCopyToClipboard = async () => {
        let text = `${fileName}\n${"=".repeat(fileName.length)}\n\n`;
        text += `Language: ${fileLanguage}\n`;
        text += `Generated by DocuMint AI\n\n`;
        text += `Summary\n-------\n${content.summary}\n\n`;

        if (content.entities) {
            content.entities.forEach(entity => {
                text += `${entity.name} (${entity.type})\n`;
                text += `-`.repeat(entity.name.length + entity.type.length + 3) + "\n";
                text += `${entity.doc}\n\n`;
            });
        }

        try {
            await navigator.clipboard.writeText(text);
            toast("Documentation copied to clipboard!", "success");
        } catch {
            toast("Failed to copy to clipboard", "error");
        }
    };

    const handleExportAdoc = () => {
        try {
            let adoc = `= ${fileName}\n`;
            adoc += `:toc:\n:source-highlighter: highlight.js\n\n`;

            adoc += `*Language:* ${fileLanguage} +\n`;
            adoc += `*Generated By:* DocuMint AI (Gemini 2.0 Flash)\n\n`;

            adoc += `== Summary\n\n${content.summary || "No summary available."}\n\n`;
            adoc += `== Detailed Analysis\n\n`;

            if (content.entities && Array.isArray(content.entities)) {
                content.entities.forEach(entity => {
                    adoc += `=== ${entity.name} (${entity.type})\n\n`;
                    adoc += `${entity.doc || "No documentation."}\n\n`;
                    adoc += `[source,${fileLanguage.toLowerCase()}]\n----\n`;
                    adoc += (entity.code || "") + "\n";
                    adoc += `----\n\n`;
                });
            }

            const blob = new Blob([adoc], { type: 'text/asciidoc' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}-docs.adoc`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed:", e);
            toast("Failed to export AsciiDoc file.", "error");
        }
    };

    const handleExportRST = () => {
        try {
            const title = fileName;
            let rst = `${title}\n${"=".repeat(title.length)}\n\n`;

            rst += `**Language:** ${fileLanguage}\n\n`;
            rst += `**Generated By:** DocuMint AI (Gemini 2.0 Flash)\n\n`;

            rst += `Summary\n-------\n\n${content.summary || "No summary available."}\n\n`;
            rst += `Detailed Analysis\n-----------------\n\n`;

            if (content.entities && Array.isArray(content.entities)) {
                content.entities.forEach(entity => {
                    const entityTitle = `${entity.name} (${entity.type})`;
                    rst += `${entityTitle}\n${"^".repeat(entityTitle.length)}\n\n`;
                    rst += `${entity.doc || "No documentation."}\n\n`;
                    rst += `.. code-block:: ${fileLanguage.toLowerCase()}\n\n`;

                    // Indent code for RST
                    const indentedCode = (entity.code || "").split('\n').map(line => '    ' + line).join('\n');
                    rst += `${indentedCode}\n\n`;
                });
            }

            const blob = new Blob([rst], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}-docs.rst`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed:", e);
            toast("Failed to export reStructuredText file.", "error");
        }
    };

    const handleExportHTML = () => {
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${fileName} - Documentation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
        h1 { color: #1a1a1a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
        h2 { color: #374151; margin-top: 40px; }
        h3 { color: #3b82f6; }
        .meta { color: #6b7280; font-size: 14px; margin-bottom: 30px; }
        .entity { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .entity-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .entity-name { font-family: monospace; font-weight: bold; color: #3b82f6; }
        .entity-type { background: #e5e7eb; padding: 2px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase; }
        pre { background: #1f2937; color: #e5e7eb; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
        .summary { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px 20px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>${fileName}</h1>
    <div class="meta">
        <strong>Language:</strong> ${fileLanguage} | 
        <strong>Generated by:</strong> DocuMint AI (Gemini 2.0 Flash)
    </div>
    
    <h2>Summary</h2>
    <div class="summary">${content.summary}</div>
    
    <h2>Detailed Analysis</h2>`;

        if (content.entities) {
            content.entities.forEach(entity => {
                html += `
    <div class="entity">
        <div class="entity-header">
            <span class="entity-name">${entity.name}</span>
            <span class="entity-type">${entity.type.replace('_', ' ')}</span>
        </div>
        <p>${entity.doc}</p>
        <pre><code>${entity.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
    </div>`;
            });
        }

        html += `
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}-docs.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const updateEntityDoc = (index: number, newDoc: string) => {
        const newEntities = [...content.entities];
        newEntities[index] = { ...newEntities[index], doc: newDoc };
        setContent({ ...content, entities: newEntities });
    };

    const handlePersonaExplain = async (persona: string) => {
        setPersonaLoading(true);
        setShowPersonaModal(true);
        setPersonaExplanation(null); // Reset previous explanation

        try {
            const res = await fetch("/api/explain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId, persona }),
            });

            if (res.ok) {
                const data = await res.json();
                setPersonaExplanation({ persona, text: data.explanation });
            } else {
                setPersonaExplanation({ persona, text: "Failed to generate explanation." });
            }
        } catch {
            setPersonaExplanation({ persona, text: "Error generating explanation." });
        } finally {
            setPersonaLoading(false);
        }
    };

    const handleOpenGithubModal = async () => {
        setLoadingRepos(true);
        try {
            const res = await fetch("/api/github/repos");
            const data = await res.json();

            if (data.error === "Unauthorized" || (data.demo && !data.connected)) {
                if (confirm("You need to connect GitHub first. Go to settings?")) {
                    router.push("/dashboard/settings?tab=integrations");
                }
                return;
            }

            setGithubRepos(data.repos);
            setShowGithubModal(true);
        } catch (error) {
            console.error(error);
            toast("Failed to load repositories", "error");
        } finally {
            setLoadingRepos(false);
        }
    };

    const handlePushToGithub = async (repoFullName: string) => {
        setPushingToGithub(true);
        try {
            const res = await fetch("/api/github/pr", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId, repoFullName }),
            });

            const data = await res.json();

            if (res.ok) {
                setShowGithubModal(false);
                if (confirm(`Pull Request created successfully! View it on GitHub?`)) {
                    window.open(data.prUrl, '_blank');
                }
            } else {
                toast(data.error || "Failed to create PR", "error");
            }
        } catch {
            toast("Something went wrong", "error");
        } finally {
            setPushingToGithub(false);
        }
    };

    const handleGenerateDiagram = async () => {
        setGeneratingDiagram(true);
        // Don't clear code immediately if we change types, maybe? No, clear it to avoid confusion.
        setDiagramCode("");
        try {
            const res = await fetch("/api/diagram/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileId, type: diagramType }),
            });
            const data = await res.json();

            if (res.ok) {
                setDiagramCode(data.diagram);
            } else {
                if (data.upgradeUrl) {
                    if (confirm(data.message + "\nGo to billing?")) {
                        router.push(data.upgradeUrl);
                    }
                    setShowDiagramModal(false);
                } else {
                    toast(data.error || "Failed to generate diagram", "error");
                }
            }
        } catch (e) {
            console.error(e);
            toast("Error generating diagram", "error");
        } finally {
            setGeneratingDiagram(false);
        }
    };

    const handleTranslate = async (targetLang: string) => {
        if (targetLang === currentLang) return;
        setTranslating(true);
        try {
            // Get current content (either edited or initial entities summary)
            // For MVP, we translate the SUMMARY if entities, or content if string.
            // But content is DocContent.
            let textToTranslate = "";
            if (content.summary) textToTranslate = content.summary;
            else if (typeof content === 'string') textToTranslate = content;
            else textToTranslate = JSON.stringify(content); // Fallback

            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: textToTranslate, targetLang })
            });
            const data = await res.json();

            if (res.ok) {
                // Update summary with translation
                // Note: We are only translating summary for MVP
                setContent(prev => ({ ...prev, summary: data.translatedText }));
                setIsEditing(true);
                setCurrentLang(targetLang);
            } else {
                toast("Translation failed", "error");
            }
        } catch (e) {
            console.error(e);
            toast("Error translating", "error");
        } finally {
            setTranslating(false);
        }
    };

    const handleVerify = async () => {
        setVerifying(true);
        try {
            const res = await fetch(`/api/docs/${fileId}/verify`, { method: "POST" });
            const data = await res.json();

            if (res.ok) {
                setContent(prev => ({
                    ...prev,
                    verifiedAt: data.verified ? data.verifiedAt : null,
                    verifiedById: data.verified ? data.verifiedById : null
                }));
                toast(data.verified ? "Documentation verified!" : "Verification removed", "success");
            } else {
                toast("Verification failed", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error verifying document", "error");
        } finally {
            setVerifying(false);
        }
    };

    const handleShareToggle = async () => {
        setSharing(true);
        try {
            const newState = !isPublic;
            const res = await fetch(`/api/docs/${fileId}/share`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isPublic: newState }),
            });
            const data = await res.json();

            if (res.ok) {
                setIsPublic(data.isPublic);
                if (data.isPublic) {
                    navigator.clipboard.writeText(data.url);
                    toast("Link copied to clipboard! Document is now public.", "success");
                } else {
                    toast("Document is now private.", "success");
                }
            } else {
                toast(data.error || "Failed to update share settings", "error");
            }
        } catch (error) {
            console.error(error);
            toast("Error updating share settings", "error");
        } finally {
            setSharing(false);
        }
    };

    return (
        <div className="glass-card p-6 min-h-[500px]">
            {/* Header */}
            <div className="border-b border-white/10 pb-4 mb-6 flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-white">{fileName}</h2>
                    <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="px-2 py-1 bg-white/10 text-white/70 text-xs rounded uppercase font-bold">{fileLanguage}</span>
                        <VerifiedBadge
                            status={content.verifiedAt ? "VERIFIED" : "UNVERIFIED"}
                            verifiedAt={content.verifiedAt || undefined}
                        // verifiedBy={content.verifiedById} // We'd need to fetch user name, skipping for now
                        />
                        {content.qualityScore && (
                            <span className={`px-2 py-1 text-xs rounded font-bold ${content.qualityScore >= 80 ? 'bg-green-100 text-green-700' :
                                content.qualityScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-red-100 text-red-700'
                                }`}>
                                Score: {content.qualityScore}/100
                            </span>
                        )}
                        {content.metadata?.linesOfCode && (
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded font-bold">
                                {content.metadata.linesOfCode} LOC
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setMode(mode === "code" ? "standard" : "code")}
                        className={`px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-2 border transition-colors ${mode === "code"
                            ? "bg-green-500/20 text-green-300 border-green-500/30"
                            : "bg-white/10 text-white/70 border-white/10 hover:bg-white/20"
                            }`}
                        title={mode === "code" ? "Return to docs" : "View source code"}
                    >
                        <FileText className="w-4 h-4" />
                        Code
                    </button>
                    <button
                        onClick={() => setMode(mode === "standard" ? "archaeology" : "standard")}
                        className={`px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-2 border transition-colors ${mode === "archaeology"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : "bg-white/10 text-white/70 border-white/10 hover:bg-white/20"
                            }`}
                        title={mode === "archaeology" ? "Return to standard view" : "Analyze code history and fossils"}
                    >
                        <Shovel className="w-4 h-4" />
                        {mode === "archaeology" ? "Exit Excavation" : "Archaeology"}
                    </button>
                    {!isEditing && (
                        <>
                            <button
                                onClick={handleRegenerate}
                                disabled={isRegenerating}
                                className="px-3 py-2 text-sm font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 rounded-lg flex items-center gap-2 disabled:opacity-50"
                            >
                                {isRegenerating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Sparkles className="w-4 h-4" />
                                )}
                                {isRegenerating ? "Regenerating..." : "Regenerate AI"}
                            </button>
                            <button
                                onClick={() => setShowPersonaModal(true)}
                                className="px-3 py-2 text-sm font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 rounded-lg flex items-center gap-2"
                            >
                                <Users className="w-4 h-4" /> Explain
                            </button>
                            <button
                                onClick={() => {
                                    setShowDiagramModal(true);
                                    if (!diagramCode) setDiagramCode("");
                                }}
                                className="px-3 py-2 text-sm font-medium text-pink-300 bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 rounded-lg flex items-center gap-2"
                            >
                                <Workflow className="w-4 h-4" /> Visualize
                            </button>
                            <DocumentationTemplates fileId={fileId} fileName={fileName} />

                            <button
                                onClick={() => {
                                    if (!content.summary) return;
                                    const utterance = new SpeechSynthesisUtterance(content.summary);
                                    window.speechSynthesis.speak(utterance);
                                }}
                                className="px-3 py-2 text-sm font-medium text-orange-300 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 rounded-lg flex items-center gap-2"
                                title="Listen to summary"
                            >
                                <Headphones className="w-4 h-4" /> Listen
                            </button>

                            <button
                                onClick={handleVerify}
                                disabled={verifying}
                                className={`px-3 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors ${content.verifiedAt
                                    ? "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
                                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                                    }`}
                                title={content.verifiedAt ? "Mark as unverified" : "Mark as verified"}
                            >
                                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                {content.verifiedAt ? "Verified" : "Verify"}
                            </button>

                            {/* Translation Dropdown */}
                            <div className="relative group">
                                <button
                                    disabled={translating}
                                    className="px-3 py-2 text-sm font-medium text-white/70 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg flex items-center gap-2 disabled:opacity-50"
                                >
                                    {translating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                    {currentLang}
                                </button>
                                <div className="absolute right-0 top-full mt-1 glass-card bg-[#0A0A0B]/95 border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[120px] overflow-hidden">
                                    {["English", "Spanish", "French", "German", "Japanese", "Chinese"].map(lang => (
                                        <button
                                            key={lang}
                                            onClick={() => handleTranslate(lang)}
                                            className="w-full text-left px-4 py-2 text-sm hover:bg-white/10 text-white/80"
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleShareToggle}
                                disabled={sharing}
                                className={`px-3 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors ${isPublic
                                    ? "bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30"
                                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                                    }`}
                                title={isPublic ? "Public - Click to make private" : "Private - Click to share"}
                            >
                                {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                                {isPublic ? "Public" : "Share"}
                            </button>

                            <div className="relative group">
                                <button
                                    className="px-3 py-2 text-sm font-medium text-white/70 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" /> Export ▾
                                </button>
                                <div className="absolute right-0 top-full mt-1 glass-card bg-[#0A0A0B]/95 border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[160px]">
                                    <button
                                        onClick={handleDownload}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                                    >
                                        📝 Markdown (.md)
                                    </button>
                                    <button
                                        onClick={handleExportHTML}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                                    >
                                        🌐 HTML (.html)
                                    </button>
                                    <button
                                        onClick={handleExportAdoc}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                                    >
                                        <span className="text-amber-500 text-xs font-bold border border-amber-500/30 bg-amber-500/10 px-1 rounded">PRO</span>
                                        📄 AsciiDoc (.adoc)
                                    </button>
                                    <button
                                        onClick={handleExportRST}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                                    >
                                        <span className="text-amber-500 text-xs font-bold border border-amber-500/30 bg-amber-500/10 px-1 rounded">PRO</span>
                                        📄 reStructuredText (.rst)
                                    </button>
                                    <button
                                        onClick={handleCopyToClipboard}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 flex items-center gap-2"
                                    >
                                        📋 Copy to Clipboard
                                    </button>
                                    <button
                                        onClick={() => handleOpenGithubModal()}
                                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 border-t border-white/10 flex items-center gap-2"
                                    >
                                        <Github className="w-4 h-4" /> Push to GitHub
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {isEditing ? (
                        <>
                            <button
                                onClick={handleCancel}
                                disabled={isSaving}
                                className="px-3 py-2 text-sm font-medium text-white/70 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"
                            >
                                <X className="w-4 h-4" /> Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2"
                            >
                                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="px-3 py-2 text-sm font-medium text-white/70 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg flex items-center gap-2"
                        >
                            <Edit2 className="w-4 h-4" /> Edit Docs
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            {
                mode === "code" ? (
                    <div className="mt-8 animate-in fade-in duration-300">
                        <div className="flex gap-4 h-[600px]">
                            {/* Code Editor */}
                            <div className="flex-1 bg-[#1e1e1e] border border-white/10 rounded-lg overflow-hidden flex flex-col">
                                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5 shrink-0">
                                    <span className="text-xs text-muted-foreground font-mono">{fileName}</span>
                                    <div className="flex items-center gap-2">
                                        {loadingRaw && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                                        <span className="text-xs text-muted-foreground">
                                            {loadingRaw ? "Loading source..." : "Read-only Preview"}
                                        </span>
                                    </div>
                                </div>
                                {loadingRaw ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-white/20" />
                                    </div>
                                ) : (
                                    <textarea
                                        value={rawContent || "// Unable to load source code."}
                                        readOnly
                                        className="w-full flex-1 p-4 bg-[#1e1e1e] text-blue-100 font-mono text-sm focus:outline-none resize-none leading-relaxed custom-scrollbar"
                                        spellCheck={false}
                                    />
                                )}
                            </div>

                            {/* AI Assistant Panel */}
                            <div className="w-[350px] bg-[#1e1e1e] border border-white/10 rounded-lg flex flex-col overflow-hidden">
                                <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center gap-2 shrink-0">
                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                    <span className="text-sm font-medium text-white">AI Architect</span>
                                </div>
                                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
                                    {chatHistory.length === 0 && (
                                        <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                            <p className="text-xs text-white/70 leading-relaxed">
                                                I'm ready to help you refactor <strong>{fileName}</strong>.
                                                I can analyze the code structure, suggest security fixes, or implement new patterns.
                                            </p>
                                        </div>
                                    )}

                                    {chatHistory.map((msg, i) => (
                                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div className={`max-w-[90%] rounded-lg p-3 text-xs ${msg.role === 'user'
                                                ? 'bg-purple-500/20 text-purple-100 border border-purple-500/30'
                                                : 'bg-white/5 text-white/90 border border-white/10'
                                                }`}>
                                                {msg.role === 'assistant' ? (
                                                    msg.content.split(/(<thinking>[\s\S]*?<\/thinking>)/g).map((part, j) => {
                                                        if (part.startsWith('<thinking>')) {
                                                            return (
                                                                <div key={j} className="mb-2 p-2 bg-yellow-500/5 border-l-2 border-yellow-500/30 text-yellow-500/70 text-[10px] italic font-mono">
                                                                    {part.replace(/<\/?thinking>/g, '').trim()}
                                                                </div>
                                                            );
                                                        }
                                                        if (!part.trim()) return null;
                                                        return <div key={j} className="whitespace-pre-wrap">{part.trim()}</div>
                                                    })
                                                ) : (
                                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {sendingChat && (
                                        <div className="flex items-start">
                                            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                                                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <div className="p-3 border-t border-white/5 bg-white/[0.02]">
                                    <div className="relative">
                                        <textarea
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendChat();
                                                }
                                            }}
                                            disabled={sendingChat}
                                            placeholder="Ask to refactor or explain (e.g. 'Optimize this loop')..."
                                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-xs text-white focus:ring-1 focus:ring-purple-500 outline-none resize-none h-20 placeholder-white/20"
                                        />
                                        <button
                                            onClick={handleSendChat}
                                            disabled={!chatInput.trim() || sendingChat}
                                            className="absolute bottom-2 right-2 p-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white transition-colors"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : mode === "archaeology" ? (
                    <div className="mt-8">
                        <CodeArchaeology fileId={fileId} fileName={fileName} />
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* File Summary */}
                        <section>
                            <h3 className="text-lg font-semibold text-white mb-2">Summary</h3>
                            {isEditing ? (
                                <textarea
                                    value={content.summary}
                                    onChange={(e) => setContent({ ...content, summary: e.target.value })}
                                    className="w-full h-32 p-4 text-sm bg-black/20 border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-white placeholder-white/30"
                                    placeholder="File summary..."
                                />
                            ) : (
                                <div className="bg-blue-500/10 p-4 rounded-lg text-blue-100 text-sm leading-relaxed border border-blue-500/20 whitespace-pre-wrap">
                                    {content.summary}
                                </div>
                            )}
                        </section>

                        {/* Security Insights */}
                        {content.securityInsights && content.securityInsights.length > 0 && (
                            <section>
                                <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                                    🛡️ Security Insights
                                </h3>
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 space-y-2">
                                    {content.securityInsights.map((insight, i) => (
                                        <div key={i} className="text-sm text-amber-200">
                                            {insight}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Detailed Analysis */}
                        {content.entities && content.entities.length > 0 && (
                            <section>
                                <h3 className="text-lg font-semibold text-white mb-4">Detailed Analysis</h3>
                                <div className="space-y-6">
                                    {content.entities.map((entity, i) => (
                                        <div key={i} className={`border rounded-lg overflow-hidden ${entity.type === 'complex_logic' ? 'border-amber-500/30' : 'border-white/10'}`}>
                                            <div className={`px-4 py-2 border-b flex justify-between items-center ${entity.type === 'complex_logic' ? 'bg-amber-500/10' : 'bg-white/5'} border-white/5`}>
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-mono text-sm font-bold ${entity.type === 'complex_logic' ? 'text-amber-300' : 'text-blue-400'}`}>{entity.name}</span>
                                                    <span className="text-xs px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/50 uppercase">{entity.type.replace('_', ' ')}</span>
                                                </div>
                                                {!isEditing && (
                                                    <button
                                                        onClick={() => handleRegenerateEntity(i)}
                                                        disabled={regeneratingEntity === i}
                                                        className="text-xs px-2 py-1 text-purple-600 hover:bg-purple-100 rounded flex items-center gap-1 disabled:opacity-50"
                                                        title="Regenerate this documentation"
                                                    >
                                                        {regeneratingEntity === i ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Sparkles className="w-3 h-3" />
                                                        )}
                                                        {regeneratingEntity === i ? "..." : "Regen"}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="p-4 bg-transparent text-white/80 text-sm">
                                                {isEditing ? (
                                                    <textarea
                                                        value={entity.doc}
                                                        onChange={(e) => updateEntityDoc(i, e.target.value)}
                                                        className="w-full h-24 p-3 text-sm bg-black/20 border border-white/10 rounded focus:ring-2 focus:ring-blue-500 outline-none resize-y text-white"
                                                    />
                                                ) : (
                                                    <pre className="whitespace-pre-wrap font-sans">{entity.doc}</pre>
                                                )}
                                            </div>
                                            <div className="bg-[#0A0A0B] text-white/30 p-3 text-xs font-mono overflow-x-auto border-t border-white/5">
                                                <div className="flex justify-between items-center mb-1 opacity-50 text-[10px]">
                                                    <span>Line {entity.startLine}-{entity.endLine}</span>
                                                </div>
                                                {entity.code}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )
            }
            {/* Persona Modal */}
            {
                showPersonaModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                            <div className="p-6 border-b flex justify-between items-center">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-600" />
                                    Explain as...
                                </h3>
                                <button onClick={() => setShowPersonaModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-grow">
                                {!personaExplanation ? (
                                    <div className="space-y-6">
                                        <p className="text-gray-600">Choose a persona to explain this code:</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {[
                                                { id: 'junior', label: 'Junior Developer', desc: 'Simple, educational, analogies' },
                                                { id: 'senior', label: 'Senior Engineer', desc: 'Concise, architectural, trade-offs' },
                                                { id: 'nontechnical', label: 'Product Manager', desc: 'Business value, high-level' }
                                            ].map(p => (
                                                <button
                                                    key={p.id}
                                                    // @ts-ignore
                                                    onClick={() => handlePersonaExplain(p.id)}
                                                    disabled={personaLoading}
                                                    className="p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50 text-left transition-all group"
                                                >
                                                    <div className="font-semibold text-gray-900 group-hover:text-blue-700">{p.label}</div>
                                                    <div className="text-xs text-gray-500 mt-1">{p.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                        {personaLoading && (
                                            <div className="flex items-center justify-center py-8 text-blue-600 gap-2">
                                                <Loader2 className="w-6 h-6 animate-spin" />
                                                <span>Generating explanation...</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 font-medium inline-block">
                                            Explained for: <span className="uppercase">{personaExplanation.persona}</span>
                                        </div>
                                        <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                                            {personaExplanation.text}
                                        </div>
                                        <button
                                            onClick={() => setPersonaExplanation(null)}
                                            className="text-sm text-blue-600 hover:underline mt-4"
                                        >
                                            ← Choose another persona
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* GitHub Repo Modal */}
            {
                showGithubModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
                            <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Github className="w-5 h-5" />
                                    Select Repository
                                </h3>
                                <button onClick={() => setShowGithubModal(false)} className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 overflow-y-auto">
                                <p className="text-sm text-gray-500 mb-4">
                                    Select a repository to create a Pull Request with the generated documentation.
                                </p>
                                {pushingToGithub ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                                        <p className="text-gray-600 font-medium">Creating Pull Request...</p>
                                        <p className="text-sm text-gray-400">This might take a moment.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {githubRepos.map(repo => (
                                            <button
                                                key={repo.id}
                                                onClick={() => handlePushToGithub(repo.full_name)}
                                                className="w-full text-left p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
                                            >
                                                <div className="font-semibold text-gray-900 group-hover:text-blue-700">{repo.full_name}</div>
                                                <div className="text-xs text-gray-500 flex gap-4 mt-1">
                                                    <span>{repo.language || "Unknown"}</span>
                                                    <span>{repo.private ? "Private" : "Public"}</span>
                                                    <span>{new Date(repo.updated_at).toLocaleDateString()}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showDiagramModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col text-white">
                            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                                <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                                    <Workflow className="w-5 h-5 text-pink-500" />
                                    Architecture Diagram
                                </h3>
                                <button onClick={() => setShowDiagramModal(false)} className="text-zinc-500 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto">
                                <div className="flex gap-4 items-center">
                                    <select
                                        value={diagramType}
                                        onChange={(e) => setDiagramType(e.target.value)}
                                        className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                                    >
                                        <option value="class">Class Diagram</option>
                                        <option value="sequence">Sequence Diagram</option>
                                        <option value="flowchart">Flowchart</option>
                                        <option value="state">State Diagram</option>
                                    </select>

                                    <button
                                        onClick={handleGenerateDiagram}
                                        disabled={generatingDiagram}
                                        className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {generatingDiagram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        Generate Diagram
                                    </button>
                                </div>

                                <div className="min-h-[400px] border border-zinc-800 rounded-xl bg-zinc-950/50 relative">
                                    {diagramCode ? (
                                        <div className="p-4">
                                            <DiagramViewer code={diagramCode} type={diagramType} />
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 p-8 text-center">
                                            <Workflow className="w-12 h-12 mb-4 opacity-20" />
                                            {generatingDiagram ? (
                                                <div className="space-y-2">
                                                    <p className="text-lg font-medium text-pink-500 animate-pulse">Analyzing code structure...</p>
                                                    <p className="text-sm">Generating {diagramType} diagram...</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-lg font-medium mb-2">Ready to Visualize</p>
                                                    <p className="text-sm max-w-md">
                                                        Select a diagram type and click Generate to visualize your code's structure, flow, or relationships using AI.
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* Smart Suggestions - Pro Feature */}
            {
                !isEditing && mode === "standard" && (
                    <div className="mt-8">
                        <DocSuggestions fileId={fileId} />
                    </div>
                )
            }

            {/* Comments Section */}
            {
                !isEditing && mode === "standard" && (
                    <CommentsSection fileId={fileId} />
                )
            }
        </div >
    );
}
