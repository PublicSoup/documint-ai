import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Code2,
    FileCode,
    ChevronUp,
    ChevronDown,
    Copy,
    Check,
    CheckCircle2,
    Undo2,
    AlertCircle,
    X,
    Plus,
    Diff
} from "lucide-react";
import { CodeBlock } from "./types";
import { copyToClipboard } from "@/lib/code-applicator";

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

export function CodeBlockRenderer({
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
    const lineCount = block.code.split('\\n').length;

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

        const codeSize = block.code.length;
        const isExtremelySuspicious = currentFileSize > 1000 && codeSize < currentFileSize * 0.1 && (currentFileSize - codeSize) > 2000;

        if (isExtremelySuspicious) {
            setWarningMessage("Warning: This code is extremely short compared to your file (>90% reduction). This might be accidental. Apply anyway?");
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

            {isExpanded && (
                <div className="relative overflow-hidden w-full">
                    <pre className="bg-[#04001a] p-3 text-[10px] md:text-xs overflow-x-auto custom-scrollbar max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        <code className="font-mono text-gray-300 whitespace-pre">{block.code}</code>
                    </pre>
                    <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-[#04001a] to-transparent pointer-events-none" />
                </div>
            )}

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

                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-3 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                            onClick={() => onInsertAtCursor(block.code)}
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Insert
                        </Button>

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
