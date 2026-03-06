"use client";

import { useState } from "react";
import useSWR from "swr";
import { File } from "@prisma/client";
import { EnhancedFileTree } from "./enhanced-file-tree";
import { Loader2 } from "lucide-react";
import { useToast } from "../toast";

const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) {
        throw new Error('An error occurred while fetching the data.');
    }
    return res.json();
});

function getLanguageFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext || 'plaintext';
}

interface FileTreeContainerProps {
    activeFileId?: string;
    onSelect: (fileId: string) => void;
    // Callbacks to notify parent of state changes
    onFileCreated: (file: File) => void;
    onFileRenamed: (fileId: string, newName: string) => void;
    onFileDeleted: (fileId: string) => void;
}

export function FileTreeContainer({ activeFileId, onSelect, onFileCreated, onFileRenamed, onFileDeleted }: FileTreeContainerProps) {
    const { data: files, error, isLoading, mutate } = useSWR<(File & { documentation?: any })[]>('/api/files', fetcher);
    const { toast } = useToast();

    const handleAction = async (action: "ai" | "delete" | "rename" | "new_file" | "new_folder", contextId?: string) => {
        switch (action) {
            case "new_file":
                const fileName = prompt(`Enter new file name${contextId !== 'Project' ? ` in ${contextId}` : ''}:`);
                if (!fileName) return;

                const fullPath = contextId && contextId !== "Project" ? `${contextId}/${fileName}` : fileName;

                try {
                    const res = await fetch("/api/files/create", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: fullPath })
                    });
                    if (!res.ok) throw new Error(await res.text());
                    const newFile = await res.json();
                    toast(`Created ${fullPath}`, "success");
                    onFileCreated(newFile); // Notify parent
                    mutate(); // Re-fetch file list
                } catch (e: any) {
                    toast(`Failed to create file: ${e.message}`, "error");
                }
                break;

            case "rename":
                if (!contextId) return;
                const fileToRename = files?.find(f => f.id === contextId);
                if (!fileToRename) return;

                const newName = prompt("Enter new file name:", fileToRename.name);
                if (!newName || newName === fileToRename.name) return;

                try {
                    const res = await fetch(`/api/files/${contextId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ newName })
                    });
                    if (!res.ok) throw new Error(await res.text());
                    const updatedFile = await res.json();
                    toast(`Renamed to ${newName}`, "success");
                    onFileRenamed(updatedFile.id, updatedFile.name); // Notify parent with updated name (includes language change)
                    mutate();
                } catch (e: any) {
                    toast(`Failed to rename: ${e.message}`, "error");
                }
                break;

            case "delete":
                if (!contextId) return;
                const fileToDelete = files?.find(f => f.id === contextId);
                if (!fileToDelete) return;

                if (confirm(`Are you sure you want to delete ${fileToDelete.name}?`)) {
                    try {
                        const res = await fetch(`/api/files/${contextId}`, { method: "DELETE" });
                        if (!res.ok) throw new Error(await res.text());
                        toast("File deleted", "success");
                        onFileDeleted(contextId); // Notify parent
                        mutate();
                    } catch (e: any) {
                        toast(`Failed to delete: ${e.message}`, "error");
                    }
                }
                break;
            
            case "new_folder":
                toast("Create a file inside a folder to establish it.", "success");
                break;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full bg-[#030014] border-r border-white/[0.04]">
                <Loader2 className="h-6 w-6 text-white/20 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-[#030014] border-r border-white/[0.04] p-4">
                <p className="text-xs text-red-400/70">Failed to load file tree.</p>
                <button
                    onClick={() => mutate()}
                    className="mt-2 px-3 py-1 text-xs bg-white/5 hover:bg-white/10 rounded transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <EnhancedFileTree
            files={files || []}
            activeFileId={activeFileId}
            onSelect={onSelect}
            onAction={handleAction}
            onRefresh={() => mutate()}
        />
    );
}
