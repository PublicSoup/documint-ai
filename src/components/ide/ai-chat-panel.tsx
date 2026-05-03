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
    CheckCircle2,
    CheckCircle,
    Lightbulb,
    ClipboardList,
    Search as SearchIcon,
    Terminal,
    Database,
    XCircle,
    Bug,
    Wand2,
    Trash2,
    MoreHorizontal,
    Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, extractCodeBlocks } from "@/lib/utils";
import { applyPatch } from "@/lib/code-patcher";
import { useToast } from "../toast";
import { useAgentLoop } from "@/hooks/use-agent-loop";
import { ToolVisualizer } from "./tool-visualizer";
import { ThinkingProcess } from "./thinking-process";
import { AVAILABLE_MODELS } from "@/lib/ai";

// ============================================================================
// Types & Interfaces
// ============================================================================

import { CodeBlock, Message, PendingChange, ThoughtStep } from "./chat/types";
import { CodeBlockRenderer } from "./chat/code-block-renderer";
import { SlashCommandMenu } from "./chat/slash-command-menu";
import { FileMentionMenu } from "./chat/file-mention-menu";
import { applyCodeBlock } from "@/lib/code-applicator";

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
    onReviewDiff?: (original: string, modified: string) => void;
    onCreateFile?: (name: string, content: string) => void;
    onSelectFile?: (fileId: string) => void;
    onAgentAction?: (action: string | null) => void;
    initialInput?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

const generateId = () => Math.random().toString(36).substring(2, 9);

const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

// Sub-components extracted to ./chat/

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
    onCreateFile,
    onSelectFile,
    onReviewDiff,
    onAgentAction,
    initialInput
}: AIChatPanelProps) {
    const { state: agentState, startTask, setThinking, executeTool, finishTool, reset } = useAgentLoop();
    const { toast } = useToast();
    // ... existing messages state ...
    const [messages, setMessages] = useState<Message[]>([
        {
            id: generateId(),
            role: "assistant",
            content: "👋 Hi! I'm your **AI Architect**. I'm ready to help.",
            codeBlocks: [],
            timestamp: Date.now()
        }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>("google/gemini-2.0-flash");

    useEffect(() => {
        const stored = localStorage.getItem("documint_model");
        if (stored) setSelectedModel(stored);
    }, []);

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setSelectedModel(val);
        localStorage.setItem("documint_model", val);
    };
    const [appliedBlocks, setAppliedBlocks] = useState<Set<string>>(new Set());
    const [undoStack, setUndoStack] = useState<PendingChange[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const abortController = useRef<AbortController | null>(null);

    // Apply code to file
    const handleApplyCode = async (code: string, blockId: string, fileName?: string) => {
        if (!activeFileId && !fileName) {
            toast("No file selected", "error");
            return;
        }

        const targetFileId = fileName ? allFiles?.find(f => f.name === fileName)?.id : activeFileId;
        const targetFileContent = fileName ? allFileContents?.[targetFileId!] : activeFileContent;

        if (!targetFileId || targetFileContent === undefined) {
            // If new file
            if (fileName && onCreateFile) {
                onCreateFile(fileName, code);
                setAppliedBlocks(prev => new Set(prev).add(blockId));
                toast(`Created ${fileName}`, "success");
                return;
            }
            toast("Target file not found", "error");
            return;
        }

        try {
            // Try smart patch first
            const patchResult = applyPatch(targetFileContent, code);
            if (patchResult && patchResult.success && patchResult.patchedCode) {
                // Push to undo stack
                setUndoStack(prev => [...prev, {
                    id: blockId,
                    fileId: targetFileId,
                    originalContent: targetFileContent,
                    newContent: patchResult.patchedCode!,
                    applied: true,
                    canUndo: true,
                    timestamp: Date.now()
                }]);

                if (onReplaceFileContent) {
                    await onReplaceFileContent(patchResult.patchedCode, false);
                    setAppliedBlocks(prev => new Set(prev).add(blockId));
                    toast("Code applied successfully", "success");
                }
            } else {
                // Patch failed — this is likely full file content, not a patch.
                // Fall back to direct replace.
                setUndoStack(prev => [...prev, {
                    id: blockId,
                    fileId: targetFileId,
                    originalContent: targetFileContent,
                    newContent: code,
                    applied: true,
                    canUndo: true,
                    timestamp: Date.now()
                }]);

                if (onReplaceFileContent) {
                    await onReplaceFileContent(code, true);
                    setAppliedBlocks(prev => new Set(prev).add(blockId));
                    toast("Code replaced successfully", "success");
                }
            }
        } catch {
            // Last resort: try direct replace on error too
            try {
                if (onReplaceFileContent) {
                    setUndoStack(prev => [...prev, {
                        id: blockId,
                        fileId: targetFileId,
                        originalContent: targetFileContent,
                        newContent: code,
                        applied: true,
                        canUndo: true,
                        timestamp: Date.now()
                    }]);
                    await onReplaceFileContent(code, true);
                    setAppliedBlocks(prev => new Set(prev).add(blockId));
                    toast("Code replaced successfully", "success");
                }
            } catch {
                toast("Error applying code", "error");
            }
        }
    };

    // Undo code application
    const handleUndo = async (blockId: string) => {
        const change = undoStack.find(c => c.id === blockId);
        if (!change) return;

        try {
            if (onReplaceFileContent) {
                // Revert to original content
                await onReplaceFileContent(change.originalContent, false);

                // Remove from stack and applied set
                setUndoStack(prev => prev.filter(c => c.id !== blockId));
                setAppliedBlocks(prev => {
                    const next = new Set(prev);
                    next.delete(blockId);
                    return next;
                });

                toast("Undid changes", "success");
            }
        } catch {
            toast("Error undoing changes", "error");
        }
    };

    // Insert code at cursor position
    const handleInsertAtCursor = (code: string) => {
        if (onInsertCodeAtCursor) {
            onInsertCodeAtCursor(code);
            toast("Code inserted at cursor", "success");
        }
    };

    // Sync FSM state with parent
    useEffect(() => {
        if (onAgentAction) {
            if (agentState.status === 'THINKING') onAgentAction("Thinking...");
            else if (agentState.status === 'EXECUTING') onAgentAction(`Running ${agentState.currentTool}...`);
            else onAgentAction(null);
        }
    }, [agentState.status, agentState.currentTool, onAgentAction]);

    // Cancel current request
    const handleCancel = useCallback(() => {
        if (abortController.current) {
            abortController.current.abort();
            abortController.current = null;
            setLoading(false);
            if (onAgentAction) onAgentAction(null);
            toast("Request cancelled", "success");
        }
    }, [onAgentAction, toast]);

    // Slash Commands
    const SLASH_COMMANDS = [
        { label: "/explain", desc: "Explain the selected code", prompt: "Explain the following code in detail:\n" },
        { label: "/fix", desc: "Fix bugs in the selected code", prompt: "Identify and fix any bugs in the following code:\n" },
        { label: "/refactor", desc: "Refactor for better performance/readability", prompt: "Refactor the following code to improve performance and readability:\n" },
        { label: "/test", desc: "Generate unit tests", prompt: "Generate comprehensive unit tests for the following code:\n" },
        { label: "/docs", desc: "Add JSDoc documentation", prompt: "Add comprehensive JSDoc comments to the following code:\n" },
    ];

    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashMenuIndex, setSlashMenuIndex] = useState(0);

    // File Mention State
    const [showFileMenu, setShowFileMenu] = useState(false);
    const [fileMenuIndex, setFileMenuIndex] = useState(0);
    const [fileSearchTerm, setFileSearchTerm] = useState("");
    const filteredFiles = allFiles?.filter(f =>
        f.name.toLowerCase().includes(fileSearchTerm.toLowerCase())
    ).slice(0, 10) || [];

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (showSlashMenu) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSlashMenuIndex(prev => (prev + 1) % SLASH_COMMANDS.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSlashMenuIndex(prev => (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                selectSlashCommand(SLASH_COMMANDS[slashMenuIndex]);
            } else if (e.key === "Escape") {
                setShowSlashMenu(false);
            }
            return;
        }

        if (showFileMenu) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setFileMenuIndex(prev => (prev + 1) % filteredFiles.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setFileMenuIndex(prev => (prev - 1 + filteredFiles.length) % filteredFiles.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (filteredFiles.length > 0) {
                    selectFileMention(filteredFiles[fileMenuIndex].name);
                }
            } else if (e.key === "Escape") {
                setShowFileMenu(false);
            }
            return;
        }

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursorPos = e.target.selectionStart;
        setInput(val);

        // Slash commands logic
        if (val === "/") {
            setShowSlashMenu(true);
            setSlashMenuIndex(0);
            setShowFileMenu(false);
            return;
        } else if (!val.startsWith("/")) {
            setShowSlashMenu(false);
        }

        // File mention logic
        const lastAtPos = val.lastIndexOf("@", cursorPos - 1);
        if (lastAtPos !== -1) {
            const textAfterAt = val.substring(lastAtPos + 1, cursorPos);
            if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
                setShowFileMenu(true);
                setFileSearchTerm(textAfterAt);
                setFileMenuIndex(0);
                return;
            }
        }
        setShowFileMenu(false);
    };

    const selectSlashCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
        setInput(cmd.prompt);
        setShowSlashMenu(false);
        inputRef.current?.focus();
    };

    const selectFileMention = (fileName: string) => {
        const cursorPos = inputRef.current?.selectionStart || input.length;
        const lastAtPos = input.lastIndexOf("@", cursorPos - 1);
        if (lastAtPos !== -1) {
            const before = input.substring(0, lastAtPos);
            const after = input.substring(cursorPos);
            const newVal = `${before}@${fileName} ${after}`;
            setInput(newVal);
            setShowFileMenu(false);

            setTimeout(() => {
                if (inputRef.current) {
                    const newCursorPos = lastAtPos + fileName.length + 2;
                    inputRef.current.selectionStart = newCursorPos;
                    inputRef.current.selectionEnd = newCursorPos;
                    inputRef.current.focus();
                }
            }, 0);
        }
    };

    // Rendering Helper
    const renderMessage = (msg: Message) => {
        const isAssistant = msg.role === "assistant";

        return (
            <div
                key={msg.id}
                className={cn(
                    "group relative mb-4 flex items-start gap-3",
                    isAssistant ? "pr-8" : "pl-8 flex-row-reverse"
                )}
            >
                <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-lg ring-1 ring-inset",
                    isAssistant
                        ? "bg-gradient-to-br from-indigo-500/10 to-purple-500/10 ring-white/10"
                        : "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 ring-white/10"
                )}>
                    {isAssistant ? (
                        <div className="relative">
                            <Bot className="w-5 h-5 text-indigo-400" />
                            {loading && msg.id === messages[messages.length - 1].id && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full" />
                            )}
                        </div>
                    ) : (
                        <User className="w-5 h-5 text-blue-400" />
                    )}
                </div>

                <div className={cn(
                    "flex-1 min-w-0 space-y-2",
                    !isAssistant && "flex flex-col items-end"
                )}>
                    {/* Author Name & Time */}
                    <div className={cn(
                        "flex items-center gap-2 px-1",
                        !isAssistant && "flex-row-reverse"
                    )}>
                        <span className="text-xs font-medium text-white/50">
                            {isAssistant ? "AI Architect" : "You"}
                        </span>
                        <span className="text-[10px] text-white/30">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>

                    {/* Thinking Process (Assistant Only) */}
                    {isAssistant && msg.thoughtSteps && (msg.thoughtSteps.length > 0 || (loading && msg.id === messages[messages.length - 1].id)) && (
                        <ThinkingProcess
                            steps={msg.thoughtSteps}
                            isThinking={loading && msg.id === messages[messages.length - 1].id && agentState.status !== 'IDLE'}
                        />
                    )}

                    {/* Message Content Bubble */}
                    {(msg.content || msg.codeBlocks.length > 0) && (
                        <div className={cn(
                            "relative overflow-hidden rounded-2xl px-4 py-3 shadow-sm ring-1 ring-inset",
                            isAssistant
                                ? "bg-white/5 ring-white/5 text-slate-300"
                                : "bg-blue-600/10 ring-blue-500/20 text-blue-100"
                        )}>
                            <div className="prose prose-invert prose-sm max-w-none text-xs md:text-sm leading-relaxed whitespace-pre-wrap">
                                {msg.content.split('```').map((part, i) => {
                                    if (i % 2 === 1) return null; // Skip code blocks in text (handled by CodeBlocks)
                                    return <span key={i}>{part}</span>;
                                })}
                            </div>
                        </div>
                    )}

                    {/* Code Blocks */}
                    {msg.codeBlocks.map((block) => (
                        <CodeBlockRenderer
                            key={block.id}
                            block={block}
                            onApply={(code) => handleApplyCode(code, block.id, block.fileName)}
                            onInsertAtCursor={(code) => onInsertCodeAtCursor?.(code)}
                            onReplace={(code) => onReplaceFileContent?.(code, true)}
                            onCreate={() => onCreateFile?.(block.fileName || "new-file.ts", block.code)}
                            isApplied={appliedBlocks.has(block.id)}
                            canUndo={undoStack.some(c => c.id === block.id)}
                            onUndo={() => handleUndo(block.id)}
                            activeFileName={activeFileName}
                            currentFileSize={activeFileContent?.length}
                            isNewFile={!allFiles?.some(f => f.name === block.fileName || block.code.includes("import ") && !activeFileId)}
                            onReviewDiff={onReviewDiff ? (code) => onReviewDiff(activeFileContent || "", code) : undefined}
                        />
                    ))}
                </div>
            </div>
        );
    };

    // Send message to AI
    // Send message to AI
    const handleSend = useCallback(async (customInput?: string) => {
        const messageToSend = customInput || input;
        if (!messageToSend.trim() || loading) return;

        const userMsg = messageToSend.trim();
        setInput("");
        setShowSlashMenu(false);
        setShowFileMenu(false);

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

        // cleanup previous controller
        if (abortController.current) {
            abortController.current.abort();
        }
        abortController.current = new AbortController();

        try {
            // Prepare context
            // If user specifically mentioned files, prioritize their content
            const mentionedFiles = userMsg.match(/@([a-zA-Z0-9_.-]+)/g)?.map(m => m.substring(1)) || [];

            const additionalContext = allFileContents
                ? Object.entries(allFileContents)
                    .filter(([id]) => id !== activeFileId)
                    .map(([id, content]) => {
                        const file = allFiles?.find(f => f.id === id);
                        if (!file) return "";

                        // If mentioned, include MORE context
                        const isMentioned = mentionedFiles.includes(file.name);
                        const maxLength = isMentioned ? 10000 : 1000;
                        const prefix = isMentioned ? "--> MENTIONED FILE: " : "// FILE: ";
                        const safeContent = typeof content === "string" ? content : "";

                        return `${prefix}${file.name}\n${safeContent.slice(0, maxLength)}${safeContent.length > maxLength ? "..." : ""}`;
                    })
                    .join("\n\n")
                : "";

            if (onAgentAction) onAgentAction("RESEARCHING CODEBASE...");

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMsg,
                    history: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    contextFileId: activeFileId,
                    contextContent: activeFileContent,
                    additionalContext: additionalContext.substring(0, 5000),
                    model: selectedModel
                }),
                signal: abortController.current.signal
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
                throw new Error(errorData.error || "Failed to get response");
            }

            if (onAgentAction) onAgentAction(null);

            // Streaming Handler
            if (res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                // Create assistant message placeholder
                const assistantId = generateId();
                setMessages(prev => [...prev, {
                    id: assistantId,
                    role: "assistant",
                    content: "",
                    codeBlocks: [],
                    timestamp: Date.now()
                }]);

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const event = JSON.parse(line);

                            // Dispatch updates based on event type
                            if (event.type === "state_change") {
                                if (event.state === "THINKING") setThinking();
                                else if (event.state === "EXECUTING") executeTool(event.tool || "unknown");
                                continue;
                            }

                            if (event.type === "thought") {
                                const thoughtText = typeof event.content === "string" ? event.content : "";
                                if (onAgentAction) onAgentAction(`Thinking: ${thoughtText.slice(0, 30)}...`);

                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    thoughtSteps: [...(m.thoughtSteps || []), {
                                        id: generateId(),
                                        type: 'thought',
                                        content: thoughtText,
                                        timestamp: Date.now()
                                    }]
                                } : m));

                            } else if (event.type === "tool_call") {
                                if (onAgentAction) onAgentAction(`Running ${event.tool}...`);

                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    thoughtSteps: [...(m.thoughtSteps || []), {
                                        id: generateId(),
                                        type: 'tool_call',
                                        content: `Invoking tool: ${event.tool}`,
                                        toolName: event.tool,
                                        timestamp: Date.now()
                                    }]
                                } : m));

                            } else if (event.type === "tool_result") {
                                const resultText = typeof event.result === "string" ? event.result : JSON.stringify(event.result ?? "");
                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    thoughtSteps: [...(m.thoughtSteps || []), {
                                        id: generateId(),
                                        type: 'tool_result',
                                        content: resultText.slice(0, 200) + (resultText.length > 200 ? "..." : ""),
                                        timestamp: Date.now()
                                    }]
                                } : m));

                            } else if (event.type === "response") {
                                const responseText = typeof event.content === "string" ? event.content : "";
                                if (onAgentAction) onAgentAction(null);
                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    content: m.content + responseText,
                                    codeBlocks: extractCodeBlocks(m.content + responseText).map(block => ({
                                        ...block,
                                        id: generateId(),
                                        fileName: block.filename,
                                        applied: false,
                                        timestamp: Date.now()
                                    }))
                                } : m));
                            } else if (event.type === "file_created") {
                                // Auto-refresh file tree and auto-open the new file (Cursor-like)
                                if (onCreateFile && event.fileName) {
                                    onCreateFile(event.fileName, event.content || "");
                                    toast(`Created ${event.fileName}`, "success");
                                }
                            } else if (event.type === "error") {
                                toast(event.message, "error");
                            }

                        } catch {
                            // Ignore malformed stream chunks and continue processing.
                        }
                    }
                }
            }

        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                return;
            }
            const errorMessage: Message = {
                id: generateId(),
                role: "assistant",
                content: `⚠️ Error: ${e instanceof Error ? e.message : "Network error"}`,
                codeBlocks: [],
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setLoading(false);
            abortController.current = null;
            inputRef.current?.focus();
            if (onAgentAction) onAgentAction(null);
        }
    }, [input, loading, activeFileId, activeFileContent, allFiles, allFileContents, onAgentAction, toast, showSlashMenu]);

    return (
        <div className="flex flex-col h-full bg-[#0A0A0B] border-l border-white/5 relative">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">DocuMint Agent</h3>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-[10px] text-muted-foreground">Online</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-500 flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        PRO
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {messages.map(msg => renderMessage(msg))}

                {/* Loading State */}
                {loading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 ring-1 ring-inset ring-white/10">
                            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                                <span className="text-xs font-medium text-white/50">AI Architect</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-indigo-300/50 bg-indigo-500/5 px-3 py-2 rounded-lg border border-indigo-500/10">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Analyzing request...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-black/20 backdrop-blur-xl border-t border-white/5 relative z-20">
                {/* Slash Command Menu */}
                {showSlashMenu && (
                    <SlashCommandMenu
                        commands={SLASH_COMMANDS}
                        selectedIndex={slashMenuIndex}
                        onSelect={selectSlashCommand}
                    />
                )}

                {/* File Mention Menu */}
                {showFileMenu && filteredFiles.length > 0 && (
                    <FileMentionMenu
                        files={filteredFiles}
                        selectedIndex={fileMenuIndex}
                        onSelect={selectFileMention}
                    />
                )}

                <div className="relative group">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask AI or type '/' for commands..."
                        className="w-full pl-4 pr-12 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-[180px] md:h-[100px] custom-scrollbar placeholder:text-white/20 transition-all font-light"
                    />

                    <div className="absolute bottom-3 left-3 flex items-center">
                        <select
                            value={selectedModel}
                            onChange={handleModelChange}
                            className="bg-black/50 border border-white/10 text-white/70 text-[10px] rounded px-2 py-1 outline-none focus:border-indigo-500/50 appearance-none cursor-pointer hover:bg-black/80 hover:text-white transition-colors custom-scrollbar"
                            style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff40%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .5rem top 50%', backgroundSize: '.65rem auto', paddingRight: '1.5rem' }}
                        >
                            {AVAILABLE_MODELS.map(model => (
                                <option key={model.id} value={model.id}>
                                    {model.label} {model.tier === "pro" ? "✨" : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        <span className="text-[10px] text-white/20 font-mono hidden md:inline-block">RETURN to send</span>
                        {loading ? (
                            <button
                                onClick={handleCancel}
                                className="p-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all shadow-lg shadow-red-500/10"
                                title="Stop Generating"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={() => handleSend()}
                                disabled={!input.trim()}
                                className="p-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
}
