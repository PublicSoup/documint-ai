import { cn } from "@/lib/utils";
import { Check, FileCode } from "lucide-react";

interface FileOption {
    id: string;
    name: string;
    language: string;
}

interface FileMentionMenuProps {
    files: FileOption[];
    selectedIndex: number;
    onSelect: (fileName: string) => void;
}

export function FileMentionMenu({ files, selectedIndex, onSelect }: FileMentionMenuProps) {
    if (files.length === 0) return null;

    return (
        <div className="absolute bottom-full left-4 mb-2 w-64 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 z-50">
            <div className="p-2 border-b border-white/5 text-[10px] font-medium text-white/40 bg-white/5 flex justify-between items-center">
                <span>FILES</span>
                <span className="text-[9px] bg-white/10 px-1 rounded">{files.length} result{files.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="p-1 max-h-48 overflow-y-auto custom-scrollbar">
                {files.map((file, i) => (
                    <button
                        key={file.id}
                        onClick={() => onSelect(file.name)}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                            i === selectedIndex ? "bg-emerald-500/20 text-emerald-300" : "text-white/70 hover:bg-white/5"
                        )}
                    >
                        <div className={cn(
                            "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold",
                            i === selectedIndex ? "bg-emerald-500 text-white" : "bg-white/10 text-white/50"
                        )}>
                            <FileCode className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{file.name}</div>
                            <div className="text-[10px] text-white/30 truncate">{file.language}</div>
                        </div>
                        {i === selectedIndex && <Check className="w-3 h-3" />}
                    </button>
                ))}
            </div>
        </div>
    );
}
