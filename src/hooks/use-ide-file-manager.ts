import { useCallback, useMemo, useState } from "react";
import { File } from "@prisma/client";
import { useToast } from "@/components/toast";

export type IDEFile = File & { content?: string | null };

interface UpsertFileOptions {
    open?: boolean;
    makeActive?: boolean;
    initialContent?: string;
    markUnsaved?: boolean;
}

export function useIDEFileManager(initialFiles: IDEFile[]) {
    const { toast } = useToast();
    const [files, setFiles] = useState(initialFiles);
    const [activeFileId, setActiveFileId] = useState<string | undefined>(initialFiles[0]?.id);
    const [openFiles, setOpenFiles] = useState<string[]>(initialFiles.length > 0 ? [initialFiles[0].id] : []);
    const initialFileContents = useMemo(
        () => initialFiles.reduce<Record<string, string>>((acc, file) => {
            if (typeof file.content === "string") {
                acc[file.id] = file.content;
            }

            return acc;
        }, {}),
        [initialFiles]
    );
    const [fileContents, setFileContents] = useState<Record<string, string>>(initialFileContents);
    const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);

    const setFileUnsavedState = useCallback((fileId: string, isUnsaved: boolean) => {
        setUnsavedChanges(prev => ({ ...prev, [fileId]: isUnsaved }));
    }, []);

    const upsertFile = useCallback((file: IDEFile, options: UpsertFileOptions = {}) => {
        const {
            open = false,
            makeActive = false,
            initialContent,
            markUnsaved = false,
        } = options;

        setFiles(prev => {
            const existingIndex = prev.findIndex(existingFile => existingFile.id === file.id);
            if (existingIndex === -1) {
                return [...prev, file];
            }

            const next = [...prev];
            next[existingIndex] = { ...next[existingIndex], ...file };
            return next;
        });

        if (initialContent !== undefined) {
            setFileContents(prev => ({ ...prev, [file.id]: initialContent }));
        }

        if (markUnsaved) {
            setUnsavedChanges(prev => ({ ...prev, [file.id]: true }));
        }

        if (open) {
            setOpenFiles(prev => prev.includes(file.id) ? prev : [...prev, file.id]);
        }

        if (makeActive) {
            setActiveFileId(file.id);
        }
    }, []);

    const renameFile = useCallback((fileId: string, newName: string) => {
        setFiles(prev => prev.map(file => (
            file.id === fileId
                ? { ...file, name: newName, language: newName.split('.').pop() || file.language }
                : file
        )));
    }, []);

    const removeFile = useCallback((fileId: string) => {
        setFiles(prev => prev.filter(file => file.id !== fileId));
        setOpenFiles(prev => {
            const next = prev.filter(id => id !== fileId);
            setActiveFileId(currentActiveFileId => currentActiveFileId === fileId ? next[next.length - 1] : currentActiveFileId);
            return next;
        });
        setFileContents(prev => {
            const next = { ...prev };
            delete next[fileId];
            return next;
        });
        setUnsavedChanges(prev => {
            const next = { ...prev };
            delete next[fileId];
            return next;
        });
    }, []);

    const replaceFileContent = useCallback((fileId: string, content: string, markUnsaved = true) => {
        setFileContents(prev => ({ ...prev, [fileId]: content }));
        if (markUnsaved) {
            setFileUnsavedState(fileId, true);
        }
    }, [setFileUnsavedState]);

    const handleFileSelect = useCallback(async (fileId: string) => {
        setOpenFiles(prev => prev.includes(fileId) ? prev : [...prev, fileId]);
        setActiveFileId(fileId);

        // If content not loaded, fetch it
        if (!Object.prototype.hasOwnProperty.call(fileContents, fileId)) {
            try {
                const res = await fetch(`/api/files/${fileId}/raw`);
                const data = await res.json();
                if (data.content !== undefined) {
                    setFileContents(prev => ({ ...prev, [fileId]: data.content }));
                } else {
                    // New/empty file — set empty string so editor shows blank
                    try {
                        setFileContents(prev => ({ ...prev, [fileId]: "" }));
                    } catch (e) {
                        toast("Failed to set initial file content", "error");
                        console.error("Failed to set initial file content:", e);
                    }
                }
            } catch (e) {
                toast("Failed to load file content", "error");
                console.error("Failed to load file content:", e);
            }
        }
    }, [fileContents, toast]);

    const handleCloseFile = useCallback((e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        setOpenFiles(prev => {
            const newOpen = prev.filter(id => id !== fileId);
            setActiveFileId(currentActiveFileId => currentActiveFileId === fileId ? newOpen[newOpen.length - 1] : currentActiveFileId);
            return newOpen;
        });
    }, []);

    const handleContentChange = useCallback((val: string | undefined) => {
        if (activeFileId && val !== undefined) {
            replaceFileContent(activeFileId, val, true);
        }
    }, [activeFileId, replaceFileContent]);

    const handleSave = useCallback(async () => {
        if (!activeFileId || !unsavedChanges[activeFileId]) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/files/${activeFileId}/raw`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: fileContents[activeFileId] })
            });

            if (res.ok) {
                setFiles(prev => prev.map(file => (
                    file.id === activeFileId
                        ? {
                            ...file,
                            content: fileContents[activeFileId],
                            size: fileContents[activeFileId]?.length ?? file.size,
                        }
                        : file
                )));
                setFileUnsavedState(activeFileId, false);
                toast("File saved successfully", "success");
            } else {
                throw new Error("Save failed");
            }
        } catch (e) {
            toast("Failed to save changes", "error");
        } finally {
            setIsSaving(false);
        }
    }, [activeFileId, fileContents, setFileUnsavedState, toast, unsavedChanges]);

    return {
        files, setFiles,
        activeFileId, setActiveFileId,
        openFiles, setOpenFiles,
        fileContents, setFileContents,
        unsavedChanges, setUnsavedChanges,
        isSaving, setIsSaving,
        upsertFile,
        renameFile,
        removeFile,
        replaceFileContent,
        setFileUnsavedState,
        handleFileSelect,
        handleCloseFile,
        handleContentChange,
        handleSave
    };
}
