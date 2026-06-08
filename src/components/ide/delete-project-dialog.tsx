"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface DeleteProjectDialogProps {
    open: boolean;
    workspace: string | null;
    fileCount: number;
    isDeleting: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => Promise<void> | void;
}

export function DeleteProjectDialog({
    open,
    workspace,
    fileCount,
    isDeleting,
    onOpenChange,
    onConfirm,
}: DeleteProjectDialogProps) {
    const [confirmationState, setConfirmationState] = useState<{ workspace: string | null; value: string }>({
        workspace: null,
        value: "",
    });
    const confirmation = open && confirmationState.workspace === workspace ? confirmationState.value : "";
    const canDelete = Boolean(workspace) && confirmation === workspace && !isDeleting;

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) setConfirmationState({ workspace: null, value: "" });
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !isDeleting && handleOpenChange(nextOpen)}>
            <DialogContent className="border-red-500/20 bg-[#080014] text-white sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-300">
                        <AlertTriangle className="h-5 w-5" />
                        Delete project
                    </DialogTitle>
                    <DialogDescription className="text-white/55">
                        This permanently deletes every file in the project workspace. This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 rounded-xl border border-red-500/15 bg-red-500/5 p-4">
                    <div className="grid gap-1 text-sm">
                        <span className="text-white/45">Project</span>
                        <span className="font-mono text-red-100">{workspace || "No project selected"}</span>
                    </div>
                    <div className="grid gap-1 text-sm">
                        <span className="text-white/45">Files affected</span>
                        <span className="font-mono text-white/80">{fileCount}</span>
                    </div>
                    <label className="grid gap-2 text-xs font-medium text-white/60">
                        Type <span className="font-mono text-red-200">{workspace}</span> to confirm
                        <input
                            value={confirmation}
                            onChange={(event) => setConfirmationState({ workspace, value: event.target.value })}
                            disabled={isDeleting || !workspace}
                            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-white/20 focus:border-red-400/50 disabled:opacity-50"
                            placeholder={workspace || "project-name"}
                        />
                    </label>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={onConfirm}
                        disabled={!canDelete}
                        isLoading={isDeleting}
                        className="bg-red-600 text-white hover:bg-red-500"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete project
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}