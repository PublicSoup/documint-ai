"use client";

import { useState } from "react";
import useSWR from "swr";
import type { File } from "@prisma/client";
import { EnhancedFileTree } from "./enhanced-file-tree";
import { Loader2 } from "lucide-react";
import { useToast } from "../toast";
import { CreateFileDialog } from "./create-file-dialog";

const getErrorMessage = async (res: Response) => {
    const data = await res.json().catch(() => null);
    return data?.message || data?.error || res.statusText || "Request failed";
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((res) => {
    if (!res.ok) {
        throw new Error('An error occurred while fetching the data.');
    }
    return res.json();
});

interface FileTreeContainerProps {
    activeFileId?: string;
    files?: (File & { content?: string | null })[];
    workspacePrefix?: string;
    onSelect: (fileId: string) => void;
    onFileCreated: (file: File) => void;
    onFileRenamed: (fileId: string, newName: string) => void;
    onFileDeleted: (fileId: string) => void;
}

export function FileTreeContainer({ activeFileId, files: providedFiles, workspacePrefix = "Project", onSelect, onFileCreated, onFileRenamed, onFileDeleted }: FileTreeContainerProps) {
    const { data: fetchedFiles, error, isLoading, mutate } = useSWR<(File & { documentation?: any })[]>('/api/files', fetcher, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
    });
    const files = providedFiles ?? fetchedFiles;
    const { toast } = useToast();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [dialogState, setDialogState] = useState<{ open: boolean; type: "file" | "folder"; parentId: string }>({
        open: false,
        type: "file",
        parentId: "Project"
    });

    const handleCreate = async (name: string) => {
        try {
            const res = await fetch("/api/files/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    type: dialogState.type,
                    parentId: dialogState.parentId,
                }),
            });
            if (!res.ok) throw new Error(await getErrorMessage(res));
            const newFile = await res.json();
            toast(`Created ${dialogState.type} '${name}'`, "success");
            onFileCreated(newFile);
            await mutate();
            return true;
        } catch (e: any) {
            toast(`Failed to create ${dialogState.type}: ${e.message}`, "error");
            return false;
        }
    };

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await mutate();
            toast("File tree refreshed", "success");
        } catch (e: any) {
            toast(`Failed to refresh files: ${e.message}`, "error");
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleAction = async (action: "ai" | "delete" | "rename" | "new_file" | "new_folder", contextId?: string) => {
        const targetParentId = contextId === "Project" ? workspacePrefix : (contextId || workspacePrefix);

        switch (action) {
            case "new_file":
                setDialogState({ open: true, type: "file", parentId: targetParentId });
                break;
            case "new_folder":
                setDialogState({ open: true, type: "folder", parentId: targetParentId });
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
                    if (!res.ok) throw new Error(await getErrorMessage(res));
                    const updatedFile = await res.json();
                    toast(`Renamed to ${newName}`, "success");
                    onFileRenamed(updatedFile.id, updatedFile.name);
                    await mutate();
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
                        if (!res.ok) throw new Error(await getErrorMessage(res));
                        toast("File deleted", "success");
                        onFileDeleted(contextId);
                        await mutate();
                    } catch (e: any) {
                        toast(`Failed to delete: ${e.message}`, "error");
                    }
                }
                break;
        }
    };

    if (isLoading && !providedFiles) {
        return (
            <div className="flex items-center justify-center h-full bg-[#030014] border-r border-white/[0.04]">
                <Loader2 className="h-6 w-6 text-white/20 animate-spin" />
            </div>
        );
    }

    if (error && !providedFiles) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-[#030014] border-r border-white/[0.04] p-4">
                <p className="text-xs text-red-400/70">Failed to load file tree.</p>
                <button
                    type="button"
                    onClick={() => mutate()}
                    className="mt-2 px-3 py-1 text-xs bg-white/5 hover:bg-white/10 rounded transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <>
            <EnhancedFileTree
                files={files || []}
                activeFileId={activeFileId}
                onSelect={onSelect}
                onAction={handleAction}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
            />
            <CreateFileDialog
                open={dialogState.open}
                onOpenChange={(open) => setDialogState(prev => ({ ...prev, open }))}
                type={dialogState.type}
                parentId={dialogState.parentId}
                onCreate={handleCreate}
            />
        </>
    );
}
