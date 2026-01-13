"use client";

import Link from "next/link";
import { Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import FileCodeIcon from "./file-code-icon";

interface FileListItemProps {
    file: {
        id: string;
        name: string;
        language: string;
        size: number;
        createdAt: Date;
    };
    isSelected: boolean;
}

import { useToast } from "./toast";

export default function FileListItem({ file, isSelected }: FileListItemProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent navigation
        e.stopPropagation();

        if (!confirm("Are you sure you want to delete this file? This cannot be undone.")) return;

        setDeleting(true);
        try {
            const res = await fetch(`/api/files/${file.id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                router.refresh();
                // If this file was selected, redirect to dashboard root
                if (isSelected) {
                    router.push("/dashboard");
                }
            } else {
                const data = await res.json();
                toast(data.error || "Failed to delete file", "error");
            }
        } catch {
            toast("Something went wrong", "error");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className={`flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors border group relative ${isSelected ? 'border-blue-500/50 bg-blue-500/10' : 'border-transparent'}`}>
            <Link
                href={`/dashboard?docId=${file.id}`}
                className="flex items-center gap-4 flex-1 min-w-0"
            >
                <FileCodeIcon language={file.language} />
                <div className="overflow-hidden flex-1 min-w-0 grid gap-0.5">
                    <div className="font-medium truncate text-sm text-white/90 group-hover:text-white transition-colors">
                        {file.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground transition-colors flex items-center gap-1.5">
                        <span>{(file.size / 1024).toFixed(1)} KB</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-white/20" />
                        <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
            </Link>

            <button
                onClick={handleDelete}
                disabled={deleting}
                className={`p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all ${deleting ? 'opacity-100' : ''}`}
                title="Delete file"
            >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
        </div>
    );
}
