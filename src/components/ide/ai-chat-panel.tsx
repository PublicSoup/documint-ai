"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    Send,
    Bot,
    User,
    Loader2,
    Sparkles,
    FileText,
    Plus,
    Check,
    X,
    Copy,
    Undo2,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Code2,
    Replace,
    FileCode,
    Diff,
    CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface CodeBlock {
    id: string;
    language: string;
    code: string;
    fileName?: string; // Extracted from "// FILE: path/to/file.ts"
    applied: boolean;
    timestamp: number;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    codeBlocks: CodeBlock[];
    timestamp: number;
}

interface PendingChange {
    id: string;
    originalContent: string;
    newContent: string;
    fileName?: string;
    applied: boolean;
    canUndo: boolean;
}

interface AIChatPanelProps {
    activeFileId: string | undefined;
    activeFileContent: string | undefined;
    activeFileName?: string;
    allFiles?: Array<{ id: string; name: string; language: string }>;
    allFileContents?: Record<string, string>;
    onInsertCode?: (code: string) => void;
    onInsertCodeAtCursor?: (code: string) => void;
    onReplaceFileContent?: (code: string, markUnsaved?: boolean) => void;
    onApplyDiff?: (original: string, modified: string) => void;
    onCreateFile?: (name: string, content: string) => void;
}

// ============================================================================
// Utility Functions
// ============================================================================

const generateId = () => Math.random().toString(36).substring(2, 9);

const extractCodeBlocks = (content: string): CodeBlock[] => {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const blocks: CodeBlock[] = [];
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = match[1] || "text";
        let code = match[2].trim();
        let fileName: string | undefined;

        // Extract file path from comment at top of code block
        // Supports: // FILE: path/to/file.ts or # FILE: path/to/file.py
        const fileMatch = code.match(/^(?:\/\/|#)\s*FILE:\s*(.+?)[\r\n]/i);
        if (fileMatch) {
            fileName = fileMatch[1].trim();
            code = code.replace(fileMatch[0], "").trim();
        }

        blocks.push({
            id: generateId(),
            language,
            code,
            fileName,
            applied: false,
            timestamp: Date.now()
        });
    }

    return blocks;
};

const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

// ============================================================================
// Sub-Components
// ============================================================================

interface CodeBlockRendererProps {
    block: CodeBlock;
    onApply: (code: string) => void;
    onInsertAtCursor: (code: string) => void;
    onReplace: (code: string) => void;
    onCreate?: () => void;
    isApplied: boolean;
    canUndo: boolean;
    onUndo?: () => void;
    activeFileName?: string;
    currentFileSize?: number;
    isNewFile?: boolean;
}

function CodeBlockRenderer({
    block,
    onApply,
    onInsertAtCursor,
    onReplace,
    onCreate,
    isApplied,
    canUndo,
    onUndo,
    activeFileName,
    currentFileSize = 0,
    isNewFile = false
}: CodeBlockRendererProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isCopied, setIsCopied] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [warningMessage, setWarningMessage] = useState<string>("");
    const lineCount = block.code.split('\n').length;

    const handleCopy = async () => {
        const success = await copyToClipboard(block.code);
        if (success) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const handleApplyClick = () => {
        if (isNewFile && onCreate) {
            onCreate();
            return;
        }

        // Safety check: if code is significantly shorter than file, warn user
        // logical heuristics: < 80% size and > 100 chars difference
        const codeSize = block.code.length;
        const isSuspiciouslySmall = currentFileSize > 0 && codeSize < currentFileSize * 0.8 && (currentFileSize - codeSize) > 100;

        if (isSuspiciouslySmall) {
            setWarningMessage("This code is much shorter than your file. Replace anyway?");
            setShowConfirm(true);
        } else if (lineCount > 20) {
            setWarningMessage(`Replace ${activeFileName || "file"} content?`);
            setShowConfirm(true);
        } else {
            onApply(block.code);
        }
    };

    const confirmApply = () => {
        onApply(block.code);
        setShowConfirm(false);
    };

    return (
        <div className="mt-3 mb-4 rounded-lg overflow-hidden border border-white/10 bg-black/20">
            {/* ... rest of rendering ... */}
            <div className="flex items-center justify-between bg-gradient-to-r from-slate-800/50 to-slate-900/50 px-3 py-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Code2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-medium text-white/70">{block.language}</span>
                    {block.fileName && (
                        <span className="text-xs text-amber-400/70 flex items-center gap-1">
                            <FileCode className="w-3 h-3" />
                            {block.fileName}
                        </span>
                    )}
                    <span className="text-[10px] text-white/30">({lineCount} lines)</span>
                </div>
                {/* ... collapse/copy buttons ... */}
                <div className="flex items-center gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-white/40 hover:text-white/70"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-white/40 hover:text-white/70"
                        onClick={handleCopy}
                        title="Copy code"
                    >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                </div>
            </div>

            {/* Code Content */}
            {isExpanded && (
                <div className="relative">
                    <pre className="bg-[#0d1117] p-4 text-xs overflow-x-auto custom-scrollbar max-h-[300px] overflow-y-auto">
                        <code className="font-mono text-gray-300 whitespace-pre">{block.code}</code>
                    </pre>
                    <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#0d1117] to-transparent pointer-events-none" />
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-900/50 to-slate-800/50 border-t border-white/5">
                {isApplied ? (
                    <div className="flex items-center gap-2 flex-1">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-green-400 font-medium">Applied successfully</span>
                        {canUndo && onUndo && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 ml-auto"
                                onClick={onUndo}
                            >
                                <Undo2 className="w-3.5 h-3.5 mr-1" />
                                Undo
                            </Button>
                        )}
                    </div>
                ) : showConfirm ? (
                    <div className="flex items-center gap-2 flex-1">
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                        <span className="text-xs text-amber-400 truncate max-w-[180px]" title={warningMessage}>{warningMessage}</span>
                        <div className="flex gap-1 ml-auto">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-3 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                onClick={confirmApply}
                            >
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Confirm
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-3 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                onClick={() => setShowConfirm(false)}
                            >
                                <X className="w-3.5 h-3.5 mr-1" />
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Primary Action: Apply/Replace */}
                        {isNewFile ? (
                            <Button
                                size="sm"
                                className="h-7 px-3 text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-blue-500/20"
                                onClick={handleApplyClick}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                Create File
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                className="h-7 px-3 text-xs bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white border-0 shadow-lg shadow-green-500/20"
                                onClick={handleApplyClick}
                            >
                                <Replace className="w-3.5 h-3.5 mr-1.5" />
                                Replace File
                            </Button>
                        )}

                        {/* Secondary: Insert at Cursor */}
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-3 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                            onClick={() => onInsertAtCursor(block.code)}
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Insert
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export function AIChatPanel({
    activeFileId,
    activeFileContent,
    activeFileName,
    allFiles,
    allFileContents,
    onInsertCode,
    onInsertCodeAtCursor,
    onReplaceFileContent,
    onCreateFile
}: AIChatPanelProps) {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: generateId(),
            role: "assistant",
            content: "👋 Hi! I'm your **AI Architect**. I have full access to your codebase and can help you:\n\n• Write and edit code\n• Explain complex logic\n• Refactor and optimize\n• Fix bugs and issues\n\nJust describe what you need, and I'll provide code you can apply directly to your files.",
            codeBlocks: [],
            timestamp: Date.now()
        }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [appliedBlocks, setAppliedBlocks] = useState<Set<string>>(new Set());
    const [undoStack, setUndoStack] = useState<PendingChange[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Handle applying code to the editor
    const handleApplyCode = useCallback((code: string, blockId: string) => {
        if (!activeFileId || !onReplaceFileContent) {
            // Fallback to onInsertCode if onReplaceFileContent not available
            if (onInsertCode) {
                onInsertCode(code);
            }
            return;
        }

        // Store undo state
        if (activeFileContent) {
            setUndoStack(prev => [...prev, {
                id: blockId,
                originalContent: activeFileContent,
                newContent: code,
                fileName: activeFileName,
                applied: true,
                canUndo: true
            }]);
        }

        // Apply the code
        onReplaceFileContent(code, true);

        // Mark as applied
        setAppliedBlocks(prev => new Set([...prev, blockId]));
    }, [activeFileId, activeFileContent, activeFileName, onInsertCode, onReplaceFileContent]);

    // Handle undo
    const handleUndo = useCallback((blockId: string) => {
        const change = undoStack.find(c => c.id === blockId);
        if (change && onReplaceFileContent) {
            onReplaceFileContent(change.originalContent, true);
            setAppliedBlocks(prev => {
                const next = new Set(prev);
                next.delete(blockId);
                return next;
            });
            setUndoStack(prev => prev.filter(c => c.id !== blockId));
        }
    }, [undoStack, onReplaceFileContent]);

    // Handle inserting code at cursor
    const handleInsertAtCursor = useCallback((code: string) => {
        if (onInsertCodeAtCursor) {
            onInsertCodeAtCursor(code);
        }
    }, [onInsertCodeAtCursor]);

    // Send message to AI
    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        setInput("");

        // Add user message
        const userMessage: Message = {
            id: generateId(),
            role: "user",
            content: userMsg,
            codeBlocks: [],
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMessage]);
        setLoading(true);

        try {
            // Prepare context - include all open file contents if available
            const additionalContext = allFileContents
                ? Object.entries(allFileContents)
                    .filter(([id]) => id !== activeFileId)
                    .map(([id, content]) => {
                        const file = allFiles?.find(f => f.id === id);
                        return file ? `// FILE: ${file.name}\n${content.substring(0, 1000)}...` : "";
                    })
                    .join("\n\n")
                : "";

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMsg,
                    contextFileId: activeFileId,
                    contextContent: activeFileContent,
                    additionalContext: additionalContext.substring(0, 5000) // Limit context size
                })
            });

            const data = await res.json();

            if (res.ok) {
                const codeBlocks = extractCodeBlocks(data.reply);
                const assistantMessage: Message = {
                    id: generateId(),
                    role: "assistant",
                    content: data.reply,
                    codeBlocks,
                    timestamp: Date.now()
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else {
                const errorMessage: Message = {
                    id: generateId(),
                    role: "assistant",
                    content: `⚠️ Error: ${data.error || "Failed to get response from AI"}`,
                    codeBlocks: [],
                    timestamp: Date.now()
                };
                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (e) {
            const errorMessage: Message = {
                id: generateId(),
                role: "assistant",
                content: "⚠️ Network error. Please check if the AI service is running.",
                codeBlocks: [],
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    // Render message content with code blocks
    const renderMessageContent = (message: Message) => {
        const parts = message.content.split(/(```[\s\S]*?```)/g);

        return parts.map((part, index) => {
            // Check if this part is a code block
            if (part.startsWith("```") && part.endsWith("```")) {
                // Find corresponding extracted code block
                const blockIndex = parts.slice(0, index).filter(p => p.startsWith("```") && p.endsWith("```")).length;
                const block = message.codeBlocks[blockIndex];

                if (!block) return null;

                const isNewFile = block.fileName && allFiles && !allFiles.some(f => f.name === block.fileName || (block.fileName && block.fileName.endsWith(f.name)));

                return (
                    <CodeBlockRenderer
                        key={block.id}
                        block={block}
                        onApply={(code) => handleApplyCode(code, block.id)}
                        onInsertAtCursor={handleInsertAtCursor}
                        onReplace={(code) => handleApplyCode(code, block.id)}
                        onCreate={() => block.fileName && onCreateFile && onCreateFile(block.fileName, block.code)}
                        isApplied={appliedBlocks.has(block.id)}
                        canUndo={undoStack.some(c => c.id === block.id)}
                        onUndo={() => handleUndo(block.id)}
                        activeFileName={activeFileName}
                        currentFileSize={activeFileContent?.length}
                        isNewFile={!!isNewFile}
                    />
                );
            }

            // Regular text - render with basic markdown support
            if (part.trim()) {
                // Simple markdown: **bold** and `code`
                const formattedText = part
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
                    .replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1 py-0.5 rounded text-xs font-mono text-amber-300">$1</code>');

                return (
                    <p
                        key={`text-${index}`}
                        className="whitespace-pre-wrap leading-relaxed mb-2 text-gray-300"
                        dangerouslySetInnerHTML={{ __html: formattedText }}
                    />
                );
            }

            return null;
        });
    };

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a]">
            {/* Header */}
            <div className="h-12 border-b border-white/5 flex items-center px-4 bg-gradient-to-r from-purple-900/20 to-indigo-900/20 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <span className="text-sm font-semibold text-white">AI Architect</span>
                        <span className="text-[10px] text-green-400 ml-2">● Online</span>
                    </div>
                </div>

                {activeFileId && (
                    <div className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/20">
                        <FileText className="w-3 h-3" />
                        <span className="truncate max-w-[100px] font-medium">{activeFileName || "Active File"}</span>
                    </div>
                )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.map((m) => (
                    <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                        <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-lg",
                            m.role === "user"
                                ? "bg-gradient-to-br from-blue-500 to-cyan-600"
                                : "bg-gradient-to-br from-purple-500 to-indigo-600"
                        )}>
                            {m.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                        </div>

                        <div className={cn(
                            "p-4 rounded-xl text-sm max-w-[90%] shadow-lg",
                            m.role === "user"
                                ? "bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/20"
                                : "bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/5"
                        )}>
                            {renderMessageContent(m)}
                        </div>
                    </div>
                ))}

                {/* Loading State */}
                {loading && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/5 p-4 rounded-xl shadow-lg">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                                <span className="text-xs text-white/50">Analyzing your code...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            {!loading && messages.length === 1 && (
                <div className="px-4 pb-2">
                    <div className="flex flex-wrap gap-2">
                        {["Explain this code", "Find bugs", "Optimize performance", "Add comments"].map(action => (
                            <button
                                key={action}
                                onClick={() => setInput(action)}
                                className="text-xs px-3 py-1.5 rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors border border-white/5"
                            >
                                {action}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t border-white/5 bg-gradient-to-r from-slate-900/50 to-slate-800/50 shrink-0">
                <div className="relative">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Ask me to write, edit, or explain code..."
                        className="w-full pl-4 pr-12 py-3 bg-black/30 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 resize-none h-[90px] custom-scrollbar placeholder:text-white/30 transition-all"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="absolute bottom-3 right-3 p-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20 disabled:shadow-none"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>

                {/* Footer Info */}
                <div className="mt-2 flex items-center justify-between text-[10px] text-white/20">
                    <div className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>AI sees your unsaved changes in real-time</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span>Enter to send</span>
                        <span className="text-white/10">•</span>
                        <span>Shift+Enter for new line</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
