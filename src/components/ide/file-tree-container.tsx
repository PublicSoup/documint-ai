"use client";

import { useState } from "react";
import useSWR from "swr";
import { EnhancedFileTree } from "./enhanced-file-tree";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "../toast";
import { CreateFileDialog, type CreateFileDialogType } from "./create-file-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FileAction, IDEFile, IDEFileWithDocumentation } from "./shared/types";

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
    files?: IDEFileWithDocumentation[];
    workspacePrefix?: string;
    onSelect: (fileId: string) => void;
    onFileCreated: (file: IDEFile) => void;
    onFileRenamed: (fileId: string, newName: string) => void;
    onFileDeleted: (fileId: string) => void;
    onProjectDeleteRequest?: (workspace: string) => void;
}

export function FileTreeContainer({ activeFileId, files: providedFiles, workspacePrefix = "Project", onSelect, onFileCreated, onFileRenamed, onFileDeleted, onProjectDeleteRequest }: FileTreeContainerProps) {
    const { data: fetchedFiles, error, isLoading, mutate } = useSWR<IDEFileWithDocumentation[]>('/api/files', fetcher, {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
    });
    const files = providedFiles ?? fetchedFiles;
    const { toast } = useToast();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [dialogState, setDialogState] = useState<{
        open: boolean;
        type: CreateFileDialogType;
        parentId: string;
        targetFile?: IDEFileWithDocumentation;
    }>({
        open: false,
        type: "file",
        parentId: "Project"
    });
    const [deleteTarget, setDeleteTarget] = useState<IDEFileWithDocumentation | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDialogSubmit = async (name: string) => {
        try {
            if (dialogState.type === "rename") {
                const target = dialogState.targetFile;
                if (!target || name === target.name) return true;

                const res = await fetch(`/api/files/${target.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ newName: name })
                });
                if (!res.ok) throw new Error(await getErrorMessage(res));
                const updatedFile = (await res.json()) as Pick<IDEFile, "id" | "name">;
                toast(`Renamed to ${updatedFile.name}`, "success");
                onFileRenamed(updatedFile.id, updatedFile.name);
                await mutate();
                return true;
            }

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
            const newFile = (await res.json()) as IDEFile;
            toast(`Created ${dialogState.type} '${name}'`, "success");
            onFileCreated(newFile);
            await mutate();
            return true;
        } catch (error) {
            const action = dialogState.type === "rename" ? "rename" : `create ${dialogState.type}`;
            toast(`Failed to ${action}: ${error instanceof Error ? error.message : "Request failed"}`, "error");
            return false;
        }
    };

    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await mutate();
            toast("File tree refreshed", "success");
        } catch (error) {
            toast(`Failed to refresh files: ${error instanceof Error ? error.message : "Request failed"}`, "error");
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDeleteConfirmed = async () => {
        if (!deleteTarget || isDeleting) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/files/${deleteTarget.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await getErrorMessage(res));
            toast("File deleted", "success");
            onFileDeleted(deleteTarget.id);
            setDeleteTarget(null);
            await mutate();
        } catch (error) {
            toast(`Failed to delete: ${error instanceof Error ? error.message : "Request failed"}`, "error");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleAction = async (action: Extract<FileAction, "ai" | "delete" | "delete_project" | "rename" | "new_file" | "new_folder">, contextId?: string) => {
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
                setDialogState({ open: true, type: "rename", parentId: targetParentId, targetFile: fileToRename });
                break;
            case "delete":
                if (!contextId) return;
                const fileToDelete = files?.find(f => f.id === contextId);
                if (!fileToDelete) return;
                setDeleteTarget(fileToDelete);
                break;
            case "delete_project":
                if (contextId) onProjectDeleteRequest?.(contextId);
                break;
            case "ai":
                if (contextId) onSelect(contextId);
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
                initialName={dialogState.targetFile?.name || ""}
                onCreate={handleDialogSubmit}
            />
            <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-400">
                            <AlertTriangle className="h-4 w-4" />
                            Delete file
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete <span className="font-mono text-foreground">{deleteTarget?.name}</span>. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleDeleteConfirmed} disabled={isDeleting} isLoading={isDeleting} className="bg-red-600 text-white hover:bg-red-500">
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
