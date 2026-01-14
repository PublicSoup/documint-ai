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
    Lightbulb,
    ClipboardList,
    Search as SearchIcon,
    Terminal,
    Database,
    XCircle,
    Bug,
    Wand2,
    Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, extractCodeBlocks } from "@/lib/utils";
import { applyPatch } from "@/lib/code-patcher";
import { useToast } from "../toast";
import { useAgentLoop } from "@/hooks/use-agent-loop";
import { ToolVisualizer } from "./tool-visualizer";

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

    // Send message to AI
    const handleSend = useCallback(async (customInput?: string) => {
        const messageToSend = customInput || input;
        if (!messageToSend.trim() || loading) return;

        const userMsg = messageToSend.trim();
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
                                // Handle FSM state changes
                                if (event.state === "THINKING") {
                                    setThinking();
                                } else if (event.state === "EXECUTING") {
                                    executeTool(event.tool || "unknown");
                                } else if (event.state === "COMPLETED") {
                                    // Agent finished
                                }
                                continue;
                            }

                            if (event.type === "thought") {
                                // Update status and append to content deeply
                                if (onAgentAction) onAgentAction(`Thinking: ${event.content.substring(0, 30)}...`);

                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    content: m.content + `[THOUGHT]\n${event.content}\n[/THOUGHT]\n`
                                } : m));

                            } else if (event.type === "tool_call") {
                                if (onAgentAction) onAgentAction(`Running ${event.tool}...`);
                                // DO NOT append to content here, as it's usually already in the 'response' event
                                // or we handle it via the specialized visualizer in renderText.

                            } else if (event.type === "tool_result") {
                                // Instead of appending directly to content, we might want to keep it separate
                                // or wrap it so it's not detected as a code block.
                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    // Use a specific marker for tool results that renderText can pick up
                                    content: m.content + `\n<tool_result>\n${event.result}\n</tool_result>\n`
                                } : m));

                            } else if (event.type === "response") {
                                if (onAgentAction) onAgentAction(null);
                                setMessages(prev => prev.map(m => m.id === assistantId ? {
                                    ...m,
                                    content: m.content + event.content,
                                    codeBlocks: extractCodeBlocks(m.content + event.content)
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
    }, [input, loading, activeFileId, activeFileContent, allFiles, allFileContents, onAgentAction, toast]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Handle initial input from Inline Editor (Cmd+I)
    // We use a ref to track if we've already processed this specific input
    const lastProcessedInput = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (initialInput && initialInput.trim() && initialInput !== lastProcessedInput.current) {
            lastProcessedInput.current = initialInput;
            // Small delay to ensure state and DOM are ready
            const timer = setTimeout(() => {
                handleSend(initialInput);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [initialInput, handleSend]);

    // Handle applying code to the editor - Cline-like behavior
    const handleApplyCode = useCallback((code: string, blockId: string, targetFileName?: string) => {
        // Smart Switching: If target file is known and different from active file, switch to it first
        if (targetFileName && allFiles && onSelectFile && activeFileName !== targetFileName) {
            // Try to find the file. Handle cases like "scripts/setup.js" vs "setup.js"
            const targetFile = allFiles.find(f =>
                f.name === targetFileName ||
                targetFileName.endsWith('/' + f.name) ||
                f.name === targetFileName.split('/').pop()
            );

            if (targetFile && targetFile.id !== activeFileId) {
                console.log(`[Cline-like] Switching to file: ${targetFile.name} (${targetFile.id})`);
                onSelectFile(targetFile.id);

                // Wait for the file to switch and load, then apply the code
                // Cline-like: seamless file switching with automatic code application
                setTimeout(() => {
                    if (onReplaceFileContent) {
                        // Try to get content from allFileContents if available
                        const currentContent = allFileContents?.[targetFile.id] || activeFileContent || "";
                        if (currentContent) {
                            // Smart apply: only replace the relevant code block
                            const smartAppliedCode = applyCodeBlock(currentContent, code);

                            setUndoStack(prev => [...prev, {
                                id: blockId,
                                originalContent: currentContent,
                                newContent: smartAppliedCode,
                                fileName: targetFile.name,
                                applied: true,
                                canUndo: true
                            }]);

                            onReplaceFileContent(smartAppliedCode, true);
                        } else {
                            // No existing content, just apply the new code
                            onReplaceFileContent(code, true);
                        }
                        setAppliedBlocks(prev => new Set([...prev, blockId]));
                    }
                }, 150);
                return;
            }
        }

        if (!activeFileId || !onReplaceFileContent) {
            // Fallback to onInsertCode if onReplaceFileContent not available
            if (onInsertCode) {
                onInsertCode(code);
            }
            return;
        }

        // Store undo state
        if (activeFileContent) {
            // Smart Patch Logic
            const patchResult = applyPatch(activeFileContent, code);

            let finalCode = code;
            let appliedMethod = "overwrite";

            if (patchResult.success && patchResult.patchedCode) {
                finalCode = patchResult.patchedCode;
                appliedMethod = patchResult.method || "patch";
                console.log(`[Smart Apply] Patched file using method: ${appliedMethod}`);
            }

            setUndoStack(prev => [...prev, {
                id: blockId,
                originalContent: activeFileContent,
                newContent: finalCode,
                fileName: activeFileName,
                applied: true,
                canUndo: true
            }]);

            // Apply the smart-patched (or full) code
            onReplaceFileContent(finalCode, true);

            if (appliedMethod !== 'full' && appliedMethod !== 'overwrite') {
                toast("Smart Patched: Updated relevant code block", "success");
            } else {
                toast("Applied changes to file", "success");
            }
        } else {
            // No existing content, just apply the new code
            onReplaceFileContent(code, true);
        }

        // Mark as applied
        setAppliedBlocks(prev => new Set([...prev, blockId]));
    }, [activeFileId, activeFileContent, activeFileName, onInsertCode, onReplaceFileContent, allFiles, onSelectFile, allFileContents]);

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

    // Helper to render text with markdown and agentic sections
    const renderText = (text: string, keyPrefix: number | string) => {
        // Handle specialized agent tags
        if (text.includes("[THOUGHT]")) {
            const thoughtContent = text.replace(/\[\/?THOUGHT\]/g, "").trim();
            // Use a details/summary for collapsible thoughts
            return (
                <details key={`thought-${keyPrefix}`} className="group bg-purple-500/5 border border-purple-500/10 rounded-lg open:bg-purple-500/10 transition-all duration-200 mb-2">
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none text-xs text-purple-300/80 font-medium hover:text-purple-300">
                        <div className="flex items-center gap-2">
                            <Lightbulb className="w-3.5 h-3.5" />
                            <span>Reasoning Process</span>
                        </div>
                        <ChevronDown className="w-3 h-3 ml-auto opacity-50 group-open:rotate-180 transition-transform" />
                    </summary>
                    <div className="px-3 pb-3 pt-0 text-xs text-purple-200/70 italic leading-relaxed border-t border-purple-500/10 mt-1 animate-in slide-in-from-top-1 fade-in-0">
                        {thoughtContent}
                    </div>
                </details>
            );
        }

        if (text.includes("[PLAN]")) {
            // Parse Markdown items into a checklist
            const planContent = text.replace("[PLAN]", "").trim();
            const items = planContent.split('\n').filter(line => line.trim().startsWith('- '));

            return (
                <div key={`plan-${keyPrefix}`} className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-4 my-3 overflow-hidden shadow-sm">
                    <div className="flex items-center gap-2 font-semibold text-blue-400 border-b border-blue-500/10 pb-2 mb-3 text-xs uppercase tracking-wider">
                        <ClipboardList className="w-3.5 h-3.5" />
                        Execution Plan
                    </div>
                    <div className="flex flex-col gap-2">
                        {items.length > 0 ? items.map((item, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm text-blue-100/80 group">
                                <div className="mt-1 w-3.5 h-3.5 rounded-full border border-blue-400/30 flex items-center justify-center shrink-0 group-hover:border-blue-400/60 transition-colors">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <span className={cn(idx === 0 && "font-medium text-white")}>
                                    {item.replace(/^- /, '')}
                                </span>
                            </div>
                        )) : (
                            <div className="whitespace-pre-wrap text-sm text-blue-100/80">{planContent}</div>
                        )}
                    </div>
                </div>
            );
        }

        if (text.includes("[RESEARCH]") || text.includes("[TOOL_RESULT")) {
            return (
                <div key={`research-${keyPrefix}`} className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-3 my-2 text-xs font-mono text-amber-200/80 flex flex-col gap-1.5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-amber-500/70 font-bold select-none">
                        <SearchIcon className="w-3 h-3" />
                        Codebase Analysis
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed pl-5 border-l-2 border-amber-500/10">
                        {text.replace(/\[(RESEARCH|TOOL_RESULT.*?)\]/, "").trim()}
                    </div>
                </div>
            );
        }

        // Handle tool calls
        // Matches: <tool_code>call:tool(args)</tool_code> OR call:tool(args)
        if (text.match(/(?:<tool_code>)?call:\s*\w+\([\s\S]*?\)(?:<\/tool_code>)?/i)) {
            const match = text.match(/(?:<tool_code>)?call:\s*(\w+)\(([\s\S]*?)\)(?:<\/tool_code>)?/i);
            const toolName = match?.[1] || "unknown";
            const args = match?.[2] || "";
            return (
                <ToolVisualizer
                    key={`tool-${keyPrefix}`}
                    toolName={toolName}
                    args={args}
                    status="running"
                />
            );
        }

        // Handle tool results
        if (text.includes("[TOOL_RESULT")) {
            // Extract tool name and result from "[TOOL_RESULT: tool_name]: result..."
            // This is a rough parse, usually the agent outputs [TOOL_RESULT: tool]: <content>
            const match = text.match(/\[TOOL_RESULT: (\w+)\]:([\s\S]*)/);
            const toolName = match?.[1] || "unknown";
            const result = match?.[2] || text.replace(/\[TOOL_RESULT.*?\]:/, "").trim();

            return (
                <ToolVisualizer
                    key={`tool-res-${keyPrefix}`}
                    toolName={toolName}
                    args="" // Result doesn't always have args context easily available unless we link to previous call
                    result={result}
                    status={result.includes("ERROR") ? "failed" : "completed"}
                />
            );
        }

        if (text.includes("[TOOL_USE]")) {
            return (
                <div key={`tool-use-${keyPrefix}`} className="flex items-center gap-2 text-blue-400 font-bold mb-2 mt-4 text-xs uppercase tracking-widest border-b border-blue-500/20 pb-1">
                    <Terminal className="w-3.5 h-3.5" />
                    Tool Usage
                </div>
            );
        }

        if (text.startsWith("<tool_result>")) {
            const rawResult = text.replace(/<\/?tool_result>/g, "").trim();
            // Try to extract tool name from prefixed result if engine does it
            const toolNameMatch = rawResult.match(/^\[TOOL_RESULT:?\s*(.*?)\]:/);
            const toolName = toolNameMatch ? toolNameMatch[1] : "Tool Output";
            const resultBody = rawResult.replace(/^\[TOOL_RESULT:?\s*(.*?)\]:/, "").trim();

            return (
                <div key={`tool-res-${keyPrefix}`} className="my-2 rounded-lg border border-white/5 bg-gray-950/50 overflow-hidden">
                    <div className="px-3 py-1.5 bg-white/5 border-b border-white/5 flex items-center gap-2">
                        <Database className="w-3 h-3 text-gray-500" />
                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{toolName} Result</span>
                    </div>
                    <div className="p-3 font-mono text-[11px] text-gray-400 whitespace-pre-wrap max-h-[150px] overflow-y-auto custom-scrollbar">
                        {resultBody || "Done"}
                    </div>
                </div>
            );
        }

        if (text.includes("[ACT]")) {
            return (
                <div key={`act-${keyPrefix}`} className="flex items-center gap-2 text-emerald-400 font-bold mb-3 mt-6 text-xs uppercase tracking-widest border-b border-emerald-500/20 pb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Proposed Changes
                </div>
            );
        }

        // Standard markdown rendering
        const formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
            .replace(/`([^`]+)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-amber-300 border border-white/5">$1</code>');

        return (
            <div
                key={`text-${keyPrefix}`}
                className="whitespace-pre-wrap leading-7 mb-2 text-gray-300 text-sm"
                dangerouslySetInnerHTML={{ __html: formattedText }}
            />
        );
    };

    // Render message content with code blocks using stored indices
    const renderMessageContent = (message: Message) => {
        if (!message.codeBlocks || message.codeBlocks.length === 0) {
            return renderText(message.content, "full");
        }

        const components: React.ReactNode[] = [];
        let lastIndex = 0;

        // Sort blocks by position just in case
        const blocks = [...message.codeBlocks].sort((a, b) => (a.startIndex || 0) - (b.startIndex || 0));

        blocks.forEach((block, i) => {
            const start = block.startIndex ?? 0;
            const end = block.endIndex ?? 0;

            // Render text before block
            if (start > lastIndex) {
                const text = message.content.substring(lastIndex, start);
                if (text.trim()) {
                    // Split text by lines or sections for better agentic rendering
                    // Updated regex to handle closing tabs and better splitting
                    const sections = text.split(/(\[THOUGHT\][\s\S]*?\[\/THOUGHT\]|\[PLAN\]|\[RESEARCH\]|\[ACT\]|<tool_code>[\s\S]*?<\/tool_code>|<tool_result>[\s\S]*?<\/tool_result>)/g).filter(s => s.trim());

                    sections.forEach((section, si) => {
                        // Check if it's a known block type
                        if (section.startsWith("[THOUGHT]") ||
                            section.startsWith("[PLAN]") ||
                            section.startsWith("[RESEARCH]") ||
                            section.startsWith("[ACT]") ||
                            section.startsWith("<tool_code>") ||
                            section.startsWith("<tool_result>")) {

                            components.push(renderText(section, `${block.id}-${si}`));
                        } else {
                            // Regular text
                            components.push(renderText(section, `${block.id}-${si}-text`));
                        }
                    });
                }
            }

            // Render block
            // Robust filename matching: check exact, endsWith, or basename
            const isNewFile = block.fileName && allFiles && !allFiles.some(f =>
                f.name === block.fileName ||
                (block.fileName && block.fileName.endsWith('/' + f.name)) ||
                (block.fileName && f.name === block.fileName.split('/').pop())
            );

            components.push(
                <CodeBlockRenderer
                    key={block.id}
                    block={block}
                    onApply={(code) => handleApplyCode(code, block.id, block.fileName)}
                    onInsertAtCursor={handleInsertAtCursor}
                    onReplace={(code) => handleApplyCode(code, block.id, block.fileName)}
                    onCreate={() => block.fileName && onCreateFile && onCreateFile(block.fileName, block.code)}
                    isApplied={appliedBlocks.has(block.id)}
                    canUndo={undoStack.some(c => c.id === block.id)}
                    onUndo={() => handleUndo(block.id)}
                    activeFileName={activeFileName}
                    currentFileSize={activeFileContent?.length}
                    isNewFile={!!isNewFile}
                    originalContent={activeFileContent}
                    onReviewDiff={onReviewDiff ? (code) => onReviewDiff(activeFileContent || "", code) : undefined}
                />
            );

            lastIndex = end;
        });

        // Render remaining text
        if (lastIndex < message.content.length) {
            const text = message.content.substring(lastIndex);
            if (text.trim()) {
                components.push(renderText(text, "post-last"));
            }
        }

        return components;
    };

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a]">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold text-white/90">AI Chat</span>
                </div>

                {activeFileId && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-400/20">
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
            {
                !loading && messages.length === 1 && (
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
                )
            }

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
                    {loading ? (
                        <button
                            onClick={handleCancel}
                            className="absolute bottom-3 right-3 p-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-all shadow-lg shadow-red-500/10 cursor-pointer"
                            title="Stop Generating"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim()}
                            className="absolute bottom-3 right-3 p-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20 disabled:shadow-none"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    )}
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
        </div >
    );
}
