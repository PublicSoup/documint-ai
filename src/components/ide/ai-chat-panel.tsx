"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
    Send,
    Bot,
    User,
    Loader2,
    Sparkles,
    X,
    Bug,
    Key,
    MoreHorizontal,
    KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ApiKeyManager } from "@/components/api-key-manager";
import { LocalModelSettings } from "@/components/local-model-settings";
import { cn, extractCodeBlocks } from "@/lib/utils";
import { applyPatch } from "@/lib/code-patcher";
import { useToast } from "../toast";
import { useAgentLoop } from "@/hooks/use-agent-loop";
import { ThinkingProcess } from "./thinking-process";
import { AVAILABLE_MODELS } from "@/lib/ai-models";
import { parseAgentEvent, type AgentEvent } from "@/lib/agent/events";
import { getRuntimeErrorFingerprint, type RuntimeLogLine, type RuntimeErrorSummary } from "@/lib/ide/runtime-events";
import { getLocalModelConfig, hasLocalModelConfig } from "@/lib/local-model";
import { runLocalAgent } from "@/lib/local-agent";
import { OpenRouterModelPicker } from "./openrouter-model-picker";

// ============================================================================
// Types & Interfaces
// ============================================================================

import { CodeBlock, Message, PendingChange } from "./chat/types";
import { CodeBlockRenderer } from "./chat/code-block-renderer";
import { SlashCommandMenu } from "./chat/slash-command-menu";
import { FileMentionMenu } from "./chat/file-mention-menu";

interface AIChatPanelProps {
    activeFileId: string | undefined;
    activeFileContent: string | undefined;
    activeFileName?: string;
    allFiles?: Array<{ id: string; name: string; language: string }>;
    allFileContents?: Record<string, string>;
    onInsertCode?: (code: string) => void;
    onInsertCodeAtCursor?: (code: string) => void;
    onReplaceFileContent?: (code: string, markUnsaved?: boolean, fileId?: string) => void;
    onApplyDiff?: (original: string, modified: string) => void;
    onReviewDiff?: (original: string, modified: string) => void;
    onCreateFile?: (name: string, content: string) => void;
    onSelectFile?: (fileId: string) => void;
    onAgentAction?: (action: string | null) => void;
    initialInput?: string;
    runtimeErrorLines?: RuntimeLogLine[];
    previewUrl?: string | null;
}

// ============================================================================
// Utility Functions
// ============================================================================

const generateId = () => Math.random().toString(36).substring(2, 9);

/** Pseudo model id for a locally-running server — intercepted before /api/chat, never sent to it. */
const LOCAL_MODEL_ID = "local/browser";

/** Model-picker sentinel for OpenRouter; the concrete model is chosen separately. */
const OPENROUTER_PICKER_ID = "openrouter/model";

type ChatFileRef = NonNullable<AIChatPanelProps["allFiles"]>[number];

interface ApplyCodeResult {
    content: string;
    markUnsaved: boolean;
    undoEntry: PendingChange;
    message: string;
}

interface AssistantStreamState {
    content: string;
    codeBlocks: CodeBlock[];
    fenceCount: number;
    parsedFenceCount: number;
}

function countCodeFences(content: string): number {
    return content.match(/```/g)?.length || 0;
}

function toStableCodeBlocks(content: string, assistantId: string): CodeBlock[] {
    return extractCodeBlocks(content).map((block, index) => ({
        ...block,
        id: `${assistantId}-block-${index}-${block.filename || "inline"}`,
        fileName: block.filename,
        applied: false,
        timestamp: Date.now(),
    }));
}

function createUndoEntry(blockId: string, fileId: string, originalContent: string, newContent: string): PendingChange {
    return {
        id: blockId,
        fileId,
        originalContent,
        newContent,
        applied: true,
        canUndo: true,
        timestamp: Date.now(),
    };
}

function applyCodeBlock(blockId: string, fileId: string, originalContent: string, code: string): ApplyCodeResult {
    const patchResult = applyPatch(originalContent, code);
    const patchedContent = patchResult?.success && patchResult.patchedCode ? patchResult.patchedCode : null;
    const content = patchedContent || code;

    return {
        content,
        markUnsaved: !patchedContent,
        undoEntry: createUndoEntry(blockId, fileId, originalContent, content),
        message: patchedContent ? "Code applied successfully" : "Code replaced successfully",
    };
}

function getMentionedFileNames(message: string): Set<string> {
    return new Set(
        (message.match(/@([^\s@]+)/g) || [])
            .map((mention) => mention.substring(1).replace(/[.,;:!?)]$/, ""))
            .filter(Boolean)
    );
}

function isMentionedFile(file: ChatFileRef, mentionedFiles: Set<string>): boolean {
    const baseName = file.name.split("/").pop() || file.name;
    return mentionedFiles.has(file.name) || mentionedFiles.has(baseName);
}

function buildAdditionalContext(params: {
    allFiles?: ChatFileRef[];
    allFileContents?: Record<string, string>;
    activeFileId?: string;
    userMessage: string;
    budget?: number;
}): string {
    const { allFiles, allFileContents, activeFileId, userMessage, budget = 5_000 } = params;
    if (!allFiles || !allFileContents) return "";

    const mentionedFiles = getMentionedFileNames(userMessage);
    const candidates = Object.entries(allFileContents)
        .filter(([id]) => id !== activeFileId)
        .map(([id, content]) => ({ file: allFiles.find((item) => item.id === id), content }))
        .filter((entry): entry is { file: ChatFileRef; content: string } => Boolean(entry.file))
        .sort((a, b) => Number(isMentionedFile(b.file, mentionedFiles)) - Number(isMentionedFile(a.file, mentionedFiles)));

    let remaining = budget;
    const sections: string[] = [];
    let omitted = 0;

    for (const { file, content } of candidates) {
        if (remaining <= 120) {
            omitted += 1;
            continue;
        }

        const mentioned = isMentionedFile(file, mentionedFiles);
        const prefix = `${mentioned ? "--> MENTIONED FILE" : "// FILE"}: ${file.name}\n`;
        const maxContentLength = Math.min(mentioned ? 2_000 : 700, remaining - prefix.length - 32);
        if (maxContentLength <= 0) {
            omitted += 1;
            continue;
        }

        const safeContent = typeof content === "string" ? content : "";
        const truncated = safeContent.length > maxContentLength
            ? `${safeContent.slice(0, maxContentLength)}\n...[truncated ${safeContent.length - maxContentLength} chars]`
            : safeContent;
        const section = `${prefix}${truncated}`;
        sections.push(section);
        remaining -= section.length + 2;
    }

    if (omitted > 0 && remaining > 24) sections.push(`[+${omitted} more files omitted]`);
    return sections.join("\n\n").slice(0, budget);
}

function compactChatContent(content: string, maxLength = 3_000): string {
    if (content.length <= maxLength) return content;

    const marker = `\n...[trimmed ${content.length - maxLength} chars]...\n`;
    const headLength = Math.max(0, Math.floor((maxLength - marker.length) * 0.65));
    const tailLength = Math.max(0, maxLength - marker.length - headLength);

    return `${content.slice(0, headLength)}${marker}${content.slice(content.length - tailLength)}`;
}

function buildCompactChatHistory(messages: Message[]): Array<{ role: Message["role"]; content: string }> {
    return messages
        .filter((message) => message.content.trim().length > 0)
        .slice(-12)
        .map((message) => ({
            role: message.role,
            content: compactChatContent(message.content),
        }));
}

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
    onInsertCodeAtCursor,
    onReplaceFileContent,
    onCreateFile,
    onReviewDiff,
    onAgentAction,
    runtimeErrorLines = [],
    previewUrl,
}: AIChatPanelProps) {
    const { state: agentState, setThinking, executeTool } = useAgentLoop();
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
    const [selectedModel, setSelectedModel] = useState<string>("google/gemini-2.5-flash");
    const [openRouterModel, setOpenRouterModel] = useState<string>("");
    const [reasoningEffort, setReasoningEffort] = useState<"low" | "medium">("low");
    const [autoFixErrors, setAutoFixErrors] = useState(true);
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    // null = not yet checked; true/false = whether an OpenRouter key is saved.
    const [hasOpenRouterKey, setHasOpenRouterKey] = useState<boolean | null>(null);

    useEffect(() => {
        // Restore the last model only if it's still selectable. Don't strand the
        // user on "Local Model" from a one-off test when no local server is
        // configured (common on Safari, which can't reach localhost at all) —
        // fall back to the default cloud model so the chat still works.
        const stored = localStorage.getItem("documint_model");
        if (stored === LOCAL_MODEL_ID) {
            if (hasLocalModelConfig()) setSelectedModel(LOCAL_MODEL_ID);
            else localStorage.removeItem("documint_model");
        } else if (stored && AVAILABLE_MODELS.some((m) => m.id === stored)) {
            setSelectedModel(stored);
        }

        const storedOpenRouter = localStorage.getItem("documint_openrouter_model");
        if (storedOpenRouter) setOpenRouterModel(storedOpenRouter);

        const storedEffort = localStorage.getItem("documint_reasoning_effort");
        if (storedEffort === "low" || storedEffort === "medium") setReasoningEffort(storedEffort);

        const storedAutoFix = localStorage.getItem("documint_auto_fix_errors");
        if (storedAutoFix) setAutoFixErrors(storedAutoFix !== "false");
    }, []);

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setSelectedModel(val);
        localStorage.setItem("documint_model", val);
    };

    const handleOpenRouterModelChange = (modelId: string) => {
        setOpenRouterModel(modelId);
        localStorage.setItem("documint_openrouter_model", modelId);
    };

    const isOpenRouter = selectedModel === OPENROUTER_PICKER_ID;

    // Know whether an OpenRouter key is actually saved so we can prompt inline
    // instead of failing on send with a confusing server error. Re-checks when
    // OpenRouter becomes the provider and after the API Keys dialog closes.
    useEffect(() => {
        if (!isOpenRouter || showApiKeyModal) return;
        let cancelled = false;
        fetch("/api/user/api-key", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!cancelled) setHasOpenRouterKey(Boolean(data?.usage?.providers?.openrouter));
            })
            .catch(() => {
                if (!cancelled) setHasOpenRouterKey(null);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpenRouter, showApiKeyModal]);

    const handleReasoningEffortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value === "medium" ? "medium" : "low";
        setReasoningEffort(val);
        localStorage.setItem("documint_reasoning_effort", val);
    };

    const toggleAutoFixErrors = () => {
        setAutoFixErrors(prev => {
            const next = !prev;
            localStorage.setItem("documint_auto_fix_errors", String(next));
            return next;
        });
    };
    const [appliedBlocks, setAppliedBlocks] = useState<Set<string>>(new Set());
    const [undoStack, setUndoStack] = useState<PendingChange[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const abortController = useRef<AbortController | null>(null);
    const reportedRuntimeErrors = useRef<Set<string>>(new Set());
    const lastRuntimeErrorReportAt = useRef(0);
    const assistantStreamStateRef = useRef<Record<string, AssistantStreamState>>({});

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

        if (!onReplaceFileContent) {
            toast("Code application is unavailable", "error");
            return;
        }

        try {
            const result = applyCodeBlock(blockId, targetFileId, targetFileContent, code);
            setUndoStack(prev => [...prev, result.undoEntry]);
            await onReplaceFileContent(result.content, result.markUnsaved, targetFileId);
            setAppliedBlocks(prev => new Set(prev).add(blockId));
            toast(result.message, "success");
        } catch {
            try {
                const undoEntry = createUndoEntry(blockId, targetFileId, targetFileContent, code);
                setUndoStack(prev => [...prev, undoEntry]);
                await onReplaceFileContent(code, true, targetFileId);
                setAppliedBlocks(prev => new Set(prev).add(blockId));
                toast("Code replaced successfully", "success");
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
                await onReplaceFileContent(change.originalContent, false, change.fileId);

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

    const appendAssistantStep = useCallback((step: NonNullable<Message["thoughtSteps"]>[number]) => {
        setMessages(prev => {
            const lastAssistant = [...prev].reverse().find(message => message.role === "assistant");
            if (!lastAssistant) return prev;

            return prev.map(message => message.id === lastAssistant.id
                ? { ...message, thoughtSteps: [...(message.thoughtSteps || []), step] }
                : message
            );
        });
    }, []);

    // Slash Commands
    const SLASH_COMMANDS = [
        { label: "/explain", desc: "Explain the selected code", prompt: "Explain the following code in detail:\n" },
        { label: "/fix", desc: "Fix bugs in the selected code", prompt: "Identify and fix any bugs in the following code:\n" },
        { label: "/refactor", desc: "Refactor for better performance/readability", prompt: "Refactor the following code to improve performance and readability:\n" },
        { label: "/test", desc: "Generate unit tests", prompt: "Generate comprehensive unit tests for the following code:\n" },
        { label: "/docs", desc: "Add JSDoc documentation", prompt: "Add comprehensive JSDoc comments to the following code:\n" },
        { label: "/build", desc: "Find and fix build/runtime errors", prompt: "Inspect this project for likely build or runtime errors. Fix only the specific issues you find, do not regenerate unrelated files, and continue until the app is runnable or a concrete blocker remains.\n" },
        { label: "/preview", desc: "Prepare app for live preview", prompt: "Prepare this app for a successful live preview. Check scripts, config, imports, and startup steps. Make targeted fixes only and tell me the exact command to run.\n" },
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

    const handleAgentEvent = useCallback((event: AgentEvent, assistantId: string) => {
        if (event.type === "state_change") {
            if (event.state === "THINKING") setThinking();
            else if (event.state === "EXECUTING") executeTool(event.tool || "unknown");
            return;
        }

        if (event.type === "thought") {
            const thoughtText = event.content;
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
            return;
        }

        if (event.type === "tool_call") {
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
            return;
        }

        if (event.type === "tool_result") {
            const resultText = event.result;
            setMessages(prev => prev.map(m => m.id === assistantId ? {
                ...m,
                thoughtSteps: [...(m.thoughtSteps || []), {
                    id: generateId(),
                    type: 'tool_result',
                    content: resultText.slice(0, 200) + (resultText.length > 200 ? "..." : ""),
                    timestamp: Date.now()
                }]
            } : m));
            return;
        }

        if (event.type === "command_event") {
            setMessages(prev => prev.map(m => m.id === assistantId ? {
                ...m,
                thoughtSteps: [...(m.thoughtSteps || []), {
                    id: generateId(),
                    type: 'command',
                    content: `${event.command} ${event.args.join(" ")} → ${event.status}${typeof event.exitCode === "number" ? ` (${event.exitCode})` : ""}`,
                    timestamp: event.timestamp
                }]
            } : m));
            return;
        }

        if (event.type === "preview_ready") {
            setMessages(prev => prev.map(m => m.id === assistantId ? {
                ...m,
                thoughtSteps: [...(m.thoughtSteps || []), {
                    id: generateId(),
                    type: 'preview',
                    content: `Preview ready${event.port ? ` on port ${event.port}` : ""}: ${event.url}`,
                    timestamp: event.timestamp
                }]
            } : m));
            return;
        }

        if (event.type === "error_report") {
            setMessages(prev => prev.map(m => m.id === assistantId ? {
                ...m,
                thoughtSteps: [...(m.thoughtSteps || []), {
                    id: generateId(),
                    type: 'error_report',
                    content: event.summary,
                    timestamp: event.timestamp
                }]
            } : m));
            return;
        }

        if (event.type === "response") {
            const responseText = event.content;
            if (onAgentAction) onAgentAction(null);
            const previous = assistantStreamStateRef.current[assistantId] || {
                content: "",
                codeBlocks: [],
                fenceCount: 0,
                parsedFenceCount: 0,
            };
            const content = previous.content + responseText;
            const fenceCount = countCodeFences(content);
            const shouldReparse = fenceCount !== previous.parsedFenceCount && fenceCount % 2 === 0;
            const codeBlocks = shouldReparse ? toStableCodeBlocks(content, assistantId) : previous.codeBlocks;
            assistantStreamStateRef.current[assistantId] = {
                content,
                codeBlocks,
                fenceCount,
                parsedFenceCount: shouldReparse ? fenceCount : previous.parsedFenceCount,
            };
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content, codeBlocks } : m));
            return;
        }

        if (event.type === "file_created") {
            if (onCreateFile && event.fileName) {
                onCreateFile(event.fileName, event.content || "");
                toast(`Created ${event.fileName}`, "success");
            }
            return;
        }

        if (event.type === "error") {
            toast(event.message, "error");
        }
    }, [executeTool, onAgentAction, onCreateFile, setThinking, toast]);

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
                            onReplace={(code) => onReplaceFileContent?.(code, true, activeFileId)}
                            onCreate={() => onCreateFile?.(block.fileName || "new-file.ts", block.code)}
                            isApplied={appliedBlocks.has(block.id)}
                            canUndo={undoStack.some(c => c.id === block.id)}
                            onUndo={() => handleUndo(block.id)}
                            activeFileName={activeFileName}
                            currentFileSize={activeFileContent?.length}
                            isNewFile={Boolean(block.fileName && !allFiles?.some(f => f.name === block.fileName))}
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

        if (selectedModel === OPENROUTER_PICKER_ID) {
            if (hasOpenRouterKey === false) {
                toast("Add your OpenRouter API key first (API Keys → OpenRouter).", "error");
                setShowApiKeyModal(true);
                return;
            }
            if (!openRouterModel) {
                toast("Pick an OpenRouter model first (next to the model selector).", "error");
                return;
            }
        }
        // OpenRouter's concrete model is chosen separately; everything else uses
        // the picker value directly.
        const effectiveModel = selectedModel === OPENROUTER_PICKER_ID
            ? `openrouter/${openRouterModel}`
            : selectedModel;

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
            const additionalContext = buildAdditionalContext({
                allFiles,
                allFileContents,
                activeFileId,
                userMessage: userMsg,
                budget: reasoningEffort === "medium" ? 5_000 : 3_500,
            });

            // Local models run entirely in the browser — the model call goes
            // straight to the user's own server instead of through /api/chat,
            // but it drives the exact same tool-using agent loop (file reads/
            // writes, search, commands): each tool call is executed server-side
            // via /api/agent/local-tool, scoped to this session's workspace.
            if (selectedModel === LOCAL_MODEL_ID) {
                const localConfig = getLocalModelConfig();
                if (!localConfig) {
                    throw new Error("Local model isn't configured yet. Open API Keys → Local Model to set it up.");
                }

                if (onAgentAction) onAgentAction(null);

                const assistantId = generateId();
                setMessages(prev => [...prev, {
                    id: assistantId,
                    role: "assistant",
                    content: "",
                    codeBlocks: [],
                    timestamp: Date.now()
                }]);

                const generator = runLocalAgent({
                    config: localConfig,
                    userMessage: userMsg,
                    additionalContext,
                    activeFileContent,
                    history: buildCompactChatHistory(messages),
                    reasoningEffort,
                    autoFixErrors,
                    signal: abortController.current.signal,
                });

                for await (const event of generator) {
                    handleAgentEvent(event, assistantId);
                }

                return;
            }

            if (onAgentAction) onAgentAction("RESEARCHING CODEBASE...");

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMsg,
                    history: buildCompactChatHistory(messages),
                    contextFileId: activeFileId,
                    contextContent: activeFileContent,
                    additionalContext,
                    model: effectiveModel,
                    reasoningEffort,
                    autoFixErrors
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
                            const event = parseAgentEvent(line);
                            if (event) handleAgentEvent(event, assistantId);

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
    }, [input, loading, activeFileId, activeFileContent, allFiles, allFileContents, onAgentAction, messages, selectedModel, openRouterModel, hasOpenRouterKey, reasoningEffort, autoFixErrors, handleAgentEvent, toast]);

    useEffect(() => {
        if (!autoFixErrors || loading || runtimeErrorLines.length === 0) return;

        const actionableLines = runtimeErrorLines
            .filter(line => /error|failed|exception|traceback|cannot find|module not found|syntaxerror|typeerror/i.test(line.data))
            .slice(-30);

        if (actionableLines.length === 0) return;

        const fingerprint = getRuntimeErrorFingerprint(actionableLines);
        const now = Date.now();
        if (reportedRuntimeErrors.current.has(fingerprint) || now - lastRuntimeErrorReportAt.current < 45_000) return;

        const controller = new AbortController();
        reportedRuntimeErrors.current.add(fingerprint);
        lastRuntimeErrorReportAt.current = now;

        void (async () => {
            try {
                const res = await fetch("/api/ide/errors", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lines: actionableLines, previous: runtimeErrorLines.slice(-60, -30) }),
                    signal: controller.signal,
                });

                if (!res.ok) return;
                const summary = await res.json() as RuntimeErrorSummary;
                if (!summary.shouldBeFixed || !summary.summary.trim()) return;

                appendAssistantStep({
                    id: generateId(),
                    type: "error_report",
                    content: `Detected runtime errors. Preparing targeted repair: ${summary.summary.slice(0, 280)}${summary.summary.length > 280 ? "..." : ""}`,
                    timestamp: Date.now(),
                });

                await handleSend(`Fix these runtime/build errors with targeted changes only. Do not regenerate unrelated files.\n\n${summary.summary}\n\nLikely files:\n${summary.paths.join("\n")}`);
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") return;
            }
        })();

        return () => controller.abort();
    }, [appendAssistantStep, autoFixErrors, handleSend, loading, runtimeErrorLines]);

    useEffect(() => {
        if (!previewUrl) return;
        appendAssistantStep({
            id: generateId(),
            type: "preview",
            content: `Preview ready: ${previewUrl}`,
            timestamp: Date.now(),
        });
    }, [appendAssistantStep, previewUrl]);

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
                    <button
                        type="button"
                        onClick={toggleAutoFixErrors}
                        className={cn(
                            "px-2 py-0.5 rounded-full border text-[10px] font-medium flex items-center gap-1 transition-colors",
                            autoFixErrors
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-white/5 border-white/10 text-white/35 hover:text-white/60"
                        )}
                        title="Toggle Vibe-style automatic targeted error repair"
                    >
                        <Bug className="w-3 h-3" />
                        Auto-fix {autoFixErrors ? "on" : "off"}
                    </button>
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
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-[150px] md:h-[92px] custom-scrollbar placeholder:text-white/20 transition-all font-light"
                    />

                    <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
                        {/* Header + close button stay fixed; only the body scrolls,
                            so the X is always reachable no matter how tall the content. */}
                        <DialogContent className="glass-card border-white/10 bg-zinc-950 max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
                            <DialogHeader className="p-6 pb-4 shrink-0">
                                <DialogTitle className="text-white flex items-center gap-2">
                                    <KeyRound className="w-4 h-4 text-primary" />
                                    API Keys
                                </DialogTitle>
                                <DialogDescription>
                                    Bring your own key from a frontier provider — or connect any
                                    OpenAI-compatible endpoint — to run models on your own account, without plan limits.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 space-y-6">
                                <ApiKeyManager />
                                <div className="pt-2 border-t border-white/[0.06] space-y-3">
                                    <div>
                                        <h3 className="text-sm font-medium text-white">Run a model on this device</h3>
                                        <p className="text-xs text-zinc-500 mt-0.5">
                                            Point at LM Studio, Ollama, or any local OpenAI-compatible server. The full
                                            agent runs on it too — file edits, search, and commands all still work.
                                        </p>
                                    </div>
                                    <LocalModelSettings />
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Control toolbar — kept below the textarea so the full model
                    name and reasoning effort are always visible, not squeezed
                    into a strip inside the input. */}
                <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                        <label htmlFor="chat-model-select" className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/35">
                            Model
                        </label>
                        <select
                            id="chat-model-select"
                            value={selectedModel}
                            onChange={handleModelChange}
                            title={AVAILABLE_MODELS.find(m => m.id === selectedModel)?.label ?? "Local Model"}
                            className="min-w-0 flex-1 bg-black/50 border border-white/10 text-white/80 text-xs rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-500/50 appearance-none cursor-pointer hover:bg-black/80 hover:text-white transition-colors"
                            style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff40%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .55rem top 50%', backgroundSize: '.65rem auto', paddingRight: '1.6rem' }}
                        >
                            {AVAILABLE_MODELS.map(model => (
                                <option key={model.id} value={model.id}>
                                    {model.label}{model.tier === "pro" ? " (Pro)" : ""}
                                </option>
                            ))}
                            <optgroup label="Local (this device)">
                                <option value={LOCAL_MODEL_ID}>Local Model (LM Studio, Ollama…)</option>
                            </optgroup>
                        </select>
                    </div>

                    {/* OpenRouter model picker — only when OpenRouter is the provider. */}
                    {isOpenRouter && (
                        hasOpenRouterKey === false ? (
                            <button
                                type="button"
                                onClick={() => setShowApiKeyModal(true)}
                                className="flex w-full items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-left text-xs text-amber-300 transition-colors hover:bg-amber-500/20"
                            >
                                <Key className="h-3.5 w-3.5 shrink-0" />
                                No OpenRouter key saved — click to add one, then pick a model.
                            </button>
                        ) : (
                            <div className="flex items-center gap-2">
                                <label className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-indigo-300/50">
                                    Model
                                </label>
                                <OpenRouterModelPicker value={openRouterModel} onChange={handleOpenRouterModelChange} />
                            </div>
                        )
                    )}

                    <div className="flex items-center gap-2">
                        <select
                            value={reasoningEffort}
                            onChange={handleReasoningEffortChange}
                            className="bg-black/50 border border-white/10 text-white/80 text-xs rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-500/50 appearance-none cursor-pointer hover:bg-black/80 hover:text-white transition-colors"
                            style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23ffffff40%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .55rem top 50%', backgroundSize: '.65rem auto', paddingRight: '1.6rem' }}
                            title="Reasoning effort"
                        >
                            <option value="low">Fast</option>
                            <option value="medium">Deep</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => setShowApiKeyModal(true)}
                            title="API Keys — bring your own provider key (Google, Anthropic, OpenAI, xAI, DeepSeek), a custom endpoint, or a local model"
                            className="flex items-center gap-1.5 bg-black/50 border border-white/10 text-white/80 text-xs rounded-md px-2.5 py-1.5 hover:bg-black/80 hover:text-white transition-colors"
                        >
                            <Key className="w-3.5 h-3.5" />
                            API Key
                        </button>

                        <div className="ml-auto flex items-center gap-2">
                            <span className="text-[10px] text-white/20 font-mono hidden lg:inline-block">RETURN to send</span>
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
            </div>
        </div >
    );
}
