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
import { ThinkingProcess, ThoughtStep } from "./thinking-process";

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
    startIndex?: number;
    endIndex?: number;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    codeBlocks: CodeBlock[];
    thoughtSteps?: ThoughtStep[];
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

/**
 * Smart code application: Tries to apply only the relevant code block instead of replacing entire file
 * This is Cline-like behavior - intelligent patching instead of full replacement
 */
const applyCodeBlock = (originalContent: string, newCode: string): string => {
    if (!originalContent || originalContent.trim() === "") {
        // Empty file, just use the new code
        return newCode;
    }

    const originalLines = originalContent.split('\n');
    const newLines = newCode.split('\n');
    const originalSize = originalContent.length;
    const newSize = newCode.length;

    // If new code is very similar in size to original (>90% match), it's likely a full replacement
    const sizeRatio = Math.min(originalSize, newSize) / Math.max(originalSize, newSize);
    if (sizeRatio > 0.9 && newSize > originalSize * 0.8) {
        return newCode;
    }

    // Strategy 1: Try to find and replace specific function/class by name
    const functionMatch = newCode.match(/(?:function|const|let|var|export\s+(?:const|function|default))\s+(\w+)\s*[=\(]/);
    const classMatch = newCode.match(/class\s+(\w+)/);
    const exportClassMatch = newCode.match(/export\s+class\s+(\w+)/);

    const targetName = functionMatch?.[1] || classMatch?.[1] || exportClassMatch?.[1];

    if (targetName) {
        // Try to find the function/class in the original file and replace just that block
        const originalLines = originalContent.split('\n');
        let startIdx = -1;
        let endIdx = -1;
        let braceCount = 0;
        let inTarget = false;

        for (let i = 0; i < originalLines.length; i++) {
            const line = originalLines[i];

            // Check if this line starts the target function/class
            if ((line.includes(`function ${targetName}`) ||
                line.includes(`const ${targetName}`) ||
                line.includes(`let ${targetName}`) ||
                line.includes(`var ${targetName}`) ||
                line.includes(`class ${targetName}`) ||
                line.includes(`export class ${targetName}`) ||
                line.includes(`export function ${targetName}`) ||
                line.includes(`export const ${targetName}`)) && startIdx === -1) {
                startIdx = i;
                inTarget = true;
            }

            if (inTarget) {
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;

                // If we've closed all braces and we're past the start, we found the end
                if (braceCount === 0 && startIdx !== -1 && i > startIdx) {
                    endIdx = i + 1;
                    break;
                }
            }
        }

        if (startIdx !== -1 && endIdx !== -1) {
            // Found the target block, replace it
            const before = originalLines.slice(0, startIdx).join('\n');
            const after = originalLines.slice(endIdx).join('\n');
            const result = (before + '\n' + newCode.trim() + '\n' + after).trim();
            return result;
        }
    }

    // Strategy 2: If new code is much smaller, try to find matching context
    if (newLines.length < originalLines.length * 0.4) {
        // Look for lines that match the beginning of the new code
        const newCodeStart = newLines[0]?.trim().substring(0, 30) || '';

        for (let i = 0; i < originalLines.length; i++) {
            const line = originalLines[i];
            if (line.trim().substring(0, 30) === newCodeStart ||
                (newCodeStart.length > 10 && line.includes(newCodeStart))) {
                // Found a match, try to replace from here
                let endIdx = i + 1;
                let braceCount = 0;
                let foundStart = false;

                for (let j = i; j < originalLines.length; j++) {
                    const currentLine = originalLines[j];
                    braceCount += (currentLine.match(/\{/g) || []).length;
                    braceCount -= (currentLine.match(/\}/g) || []).length;

                    if (braceCount > 0) foundStart = true;
                    if (foundStart && braceCount === 0 && j > i) {
                        endIdx = j + 1;
                        break;
                    }
                }

                // Replace the identified block
                const before = originalLines.slice(0, i).join('\n');
                const after = originalLines.slice(endIdx).join('\n');
                return (before + '\n' + newCode.trim() + '\n' + after).trim();
            }
        }
    }

    // Strategy 3: Check if new code looks like a complete file (has imports/exports at top)
    const hasTopLevelImports = /^(import|export|from|require)/m.test(newCode.trim());
    const functionCount = (newCode.match(/(?:function|const|let|var)\s+\w+\s*[=\(]/g) || []).length;
    const classCount = (newCode.match(/class\s+\w+/g) || []).length;

    // If it has imports at top AND multiple functions/classes, it's likely a full file
    if (hasTopLevelImports && (functionCount > 1 || classCount > 0)) {
        return newCode;
    }

    // Strategy 4: If new code is very small (< 10% of original), append it
    if (newSize < originalSize * 0.1 && newLines.length < 10) {
        return originalContent + '\n\n' + newCode;
    }

    // Default: If we can't intelligently patch, replace the entire file
    // This is safer than guessing wrong
    return newCode;
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
    originalContent?: string;
    onReviewDiff?: (code: string) => void;
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
    isNewFile = false,
    originalContent,
    onReviewDiff
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

        // Cline-like behavior: Apply directly, only warn for extreme cases
        // Only warn if code is extremely small (< 10% of original) - almost certainly accidental deletion
        const codeSize = block.code.length;
        const isExtremelySuspicious = currentFileSize > 1000 && codeSize < currentFileSize * 0.1 && (currentFileSize - codeSize) > 2000;

        if (isExtremelySuspicious) {
            setWarningMessage("Warning: This code is extremely short compared to your file (>90% reduction). This might be accidental. Apply anyway?");
            setShowConfirm(true);
        } else {
            // Apply directly like Cline - no confirmation needed for normal operations
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
                <div className="relative overflow-hidden w-full">
                    <pre className="bg-[#0d1117] p-3 text-[10px] md:text-xs overflow-x-auto custom-scrollbar max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        <code className="font-mono text-gray-300 whitespace-pre">{block.code}</code>
                    </pre>
                    <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-[#0d1117] to-transparent pointer-events-none" />
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
                                <Check className="w-3.5 h-3.5 mr-1.5" />
                                Apply
                            </Button>
                        )}

                        {/* Secondary: Insert at Cursor */}
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

                        {/* Review Diff Action */}
                        {!isNewFile && onReviewDiff && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-3 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                                onClick={() => onReviewDiff(block.code)}
                            >
                                <Diff className="w-3.5 h-3.5 mr-1" />
                                Review
                            </Button>
                        )}
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
                return;
            }
            toast("Target file not found", "error");
            return;
        }

        try {
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
                    await onReplaceFileContent(patchResult.patchedCode, false); // Using false to indicate it's not a full replace if it was a patch, but here we treat result as full content
                    setAppliedBlocks(prev => new Set(prev).add(blockId));
                    toast("Code applied successfully", "success");
                }
            } else {
                toast("Failed to apply patch", "error");
            }
        } catch (e) {
            console.error("Apply code error:", e);
            toast("Error applying code", "error");
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
        } catch (e) {
            console.error("Undo error:", e);
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
        }

        if (e.key === "Enter" && !e.shiftKey && !showSlashMenu) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInput(val);
        if (val === "/") {
            setShowSlashMenu(true);
            setSlashMenuIndex(0);
        } else if (!val.startsWith("/")) {
            setShowSlashMenu(false);
        }
    };

    const selectSlashCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
        setInput(cmd.prompt);
        setShowSlashMenu(false);
        inputRef.current?.focus();
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
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
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
        setShowSlashMenu(false); // Close slash menu if open

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
            const additionalContext = allFileContents
                ? Object.entries(allFileContents)
                    .filter(([id]) => id !== activeFileId)
                    .map(([id, content]) => {
                        const file = allFiles?.find(f => f.id === id);
                        return file ? `// FILE: ${file.name}\n${content.substring(0, 1000)}...` : "";
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
                    additionalContext: additionalContext.substring(0, 5000)
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
                                if (onAgentAction) onAgentAction(`Thinking: ${event.content.substring(0, 30)}...`);

                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    thoughtSteps: [...(m.thoughtSteps || []), {
                                        id: generateId(),
                                        type: 'thought',
                                        content: event.content,
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
                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    thoughtSteps: [...(m.thoughtSteps || []), {
                                        id: generateId(),
                                        type: 'tool_result',
                                        content: event.result.substring(0, 200) + (event.result.length > 200 ? "..." : ""),
                                        timestamp: Date.now()
                                    }]
                                } : m));

                            } else if (event.type === "response") {
                                if (onAgentAction) onAgentAction(null);
                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    content: m.content + event.content,
                                    codeBlocks: extractCodeBlocks(m.content + event.content).map(block => ({
                                        ...block,
                                        id: generateId(),
                                        fileName: block.filename,
                                        applied: false,
                                        timestamp: Date.now()
                                    }))
                                } : m));
                            } else if (event.type === "error") {
                                toast(event.message, "error");
                            }

                        } catch (e) {
                            console.error("Error parsing stream line:", e);
                        }
                    }
                }
            }

        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log("Request aborted");
                return;
            }
            const errorMessage: Message = {
                id: generateId(),
                role: "assistant",
                content: `⚠️ Error: ${e.message || "Network error"}`,
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
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
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
                    <div className="absolute bottom-full left-4 mb-2 w-64 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 z-50">
                        <div className="p-2 border-b border-white/5 text-[10px] font-medium text-white/40 bg-white/5">
                            COMMANDS
                        </div>
                        <div className="p-1">
                            {SLASH_COMMANDS.map((cmd, i) => (
                                <button
                                    key={cmd.label}
                                    onClick={() => selectSlashCommand(cmd)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                                        i === slashMenuIndex ? "bg-indigo-500/20 text-indigo-300" : "text-white/70 hover:bg-white/5"
                                    )}
                                >
                                    <div className={cn(
                                        "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold",
                                        i === slashMenuIndex ? "bg-indigo-500 text-white" : "bg-white/10 text-white/50"
                                    )}>
                                        /
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium">{cmd.label}</div>
                                        <div className="text-[10px] text-white/30 truncate">{cmd.desc}</div>
                                    </div>
                                    {i === slashMenuIndex && <Check className="w-3 h-3" />}
                                </button>
                            ))}
                        </div>
                    </div>
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
