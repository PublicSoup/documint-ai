import { useCallback, useReducer, useRef } from "react";
import { useToast } from "@/components/toast";
import type { IDEFile, IDEFileContentMap, IDEUnsavedMap } from "@/components/ide/shared/types";
import { getResponseErrorMessage, getStorageLanguageFromFileName } from "@/components/ide/shared/ide-constants";

interface UpsertFileOptions {
    open?: boolean;
    makeActive?: boolean;
    initialContent?: string;
    markUnsaved?: boolean;
}

interface IDEFileManagerState {
    files: IDEFile[];
    activeFileId?: string;
    openFiles: string[];
    fileContents: IDEFileContentMap;
    unsavedChanges: IDEUnsavedMap;
    isSaving: boolean;
}

type IDEFileManagerAction =
    | { type: "UPSERT_FILE"; file: IDEFile; options: UpsertFileOptions }
    | { type: "RENAME_FILE"; fileId: string; newName: string }
    | { type: "REMOVE_FILE"; fileId: string }
    | { type: "REMOVE_FILES"; fileIds: string[] }
    | { type: "SELECT_FILE"; fileId: string }
    | { type: "CLOSE_FILE"; fileId: string }
    | { type: "SET_FILE_CONTENT"; fileId: string; content: string; markUnsaved?: boolean }
    | { type: "SET_FILE_UNSAVED"; fileId: string; isUnsaved: boolean }
    | { type: "SET_SAVING"; isSaving: boolean }
    | { type: "MARK_FILE_SAVED"; fileId: string; content: string };

function createInitialState(initialFiles: IDEFile[]): IDEFileManagerState {
    const [firstFile] = initialFiles;
    const fileContents = initialFiles.reduce<IDEFileContentMap>((acc, file) => {
        if (typeof file.content === "string") {
            acc[file.id] = file.content;
        }

        return acc;
    }, {});

    return {
        files: initialFiles,
        activeFileId: firstFile?.id,
        openFiles: firstFile ? [firstFile.id] : [],
        fileContents,
        unsavedChanges: {},
        isSaving: false,
    };
}

function removeFlag<T>(source: Record<string, T>, key: string): Record<string, T> {
    const next = { ...source };
    delete next[key];
    return next;
}

function getFallbackActiveFileId(openFiles: string[], closingFileId: string): string | undefined {
    const remainingOpenFiles = openFiles.filter((id) => id !== closingFileId);
    return remainingOpenFiles[remainingOpenFiles.length - 1];
}

function reducer(state: IDEFileManagerState, action: IDEFileManagerAction): IDEFileManagerState {
    switch (action.type) {
        case "UPSERT_FILE": {
            const { file, options } = action;
            const existingIndex = state.files.findIndex((existingFile) => existingFile.id === file.id);
            const files = existingIndex === -1
                ? [...state.files, file]
                : state.files.map((existingFile, index) => index === existingIndex ? { ...existingFile, ...file } : existingFile);

            const openFiles = options.open && !state.openFiles.includes(file.id)
                ? [...state.openFiles, file.id]
                : state.openFiles;

            return {
                ...state,
                files,
                openFiles,
                activeFileId: options.makeActive ? file.id : state.activeFileId,
                fileContents: options.initialContent !== undefined
                    ? { ...state.fileContents, [file.id]: options.initialContent }
                    : state.fileContents,
                unsavedChanges: options.markUnsaved
                    ? { ...state.unsavedChanges, [file.id]: true }
                    : state.unsavedChanges,
            };
        }
        case "RENAME_FILE":
            return {
                ...state,
                files: state.files.map((file) => file.id === action.fileId
                    ? { ...file, name: action.newName, language: getStorageLanguageFromFileName(action.newName) }
                    : file),
            };
        case "REMOVE_FILE":
            return {
                ...state,
                files: state.files.filter((file) => file.id !== action.fileId),
                openFiles: state.openFiles.filter((id) => id !== action.fileId),
                activeFileId: state.activeFileId === action.fileId
                    ? getFallbackActiveFileId(state.openFiles, action.fileId)
                    : state.activeFileId,
                fileContents: removeFlag(state.fileContents, action.fileId) as IDEFileContentMap,
                unsavedChanges: removeFlag(state.unsavedChanges, action.fileId) as IDEUnsavedMap,
            };
        case "REMOVE_FILES": {
            const idsToRemove = new Set(action.fileIds);
            const openFiles = state.openFiles.filter((id) => !idsToRemove.has(id));
            const fileContents = { ...state.fileContents };
            const unsavedChanges = { ...state.unsavedChanges };

            idsToRemove.forEach((fileId) => {
                delete fileContents[fileId];
                delete unsavedChanges[fileId];
            });

            return {
                ...state,
                files: state.files.filter((file) => !idsToRemove.has(file.id)),
                openFiles,
                activeFileId: state.activeFileId && idsToRemove.has(state.activeFileId)
                    ? openFiles[openFiles.length - 1]
                    : state.activeFileId,
                fileContents,
                unsavedChanges,
            };
        }
        case "SELECT_FILE":
            return {
                ...state,
                activeFileId: action.fileId,
                openFiles: state.openFiles.includes(action.fileId)
                    ? state.openFiles
                    : [...state.openFiles, action.fileId],
            };
        case "CLOSE_FILE":
            return {
                ...state,
                openFiles: state.openFiles.filter((id) => id !== action.fileId),
                activeFileId: state.activeFileId === action.fileId
                    ? getFallbackActiveFileId(state.openFiles, action.fileId)
                    : state.activeFileId,
            };
        case "SET_FILE_CONTENT":
            return {
                ...state,
                fileContents: { ...state.fileContents, [action.fileId]: action.content },
                unsavedChanges: action.markUnsaved
                    ? { ...state.unsavedChanges, [action.fileId]: true }
                    : state.unsavedChanges,
            };
        case "SET_FILE_UNSAVED":
            return {
                ...state,
                unsavedChanges: { ...state.unsavedChanges, [action.fileId]: action.isUnsaved },
            };
        case "SET_SAVING":
            return { ...state, isSaving: action.isSaving };
        case "MARK_FILE_SAVED":
            return {
                ...state,
                files: state.files.map((file) => file.id === action.fileId
                    ? { ...file, content: action.content, size: action.content.length }
                    : file),
                unsavedChanges: { ...state.unsavedChanges, [action.fileId]: false },
            };
        default: {
            const exhaustive: never = action;
            return exhaustive;
        }
    }
}

export function useIDEFileManager(initialFiles: IDEFile[]) {
    const { toast } = useToast();
    const [state, dispatch] = useReducer(reducer, initialFiles, createInitialState);
    const inflightContentLoads = useRef(new Set<string>());
    const latestStateRef = useRef(state);
    latestStateRef.current = state;

    const setFileUnsavedState = useCallback((fileId: string, isUnsaved: boolean) => {
        dispatch({ type: "SET_FILE_UNSAVED", fileId, isUnsaved });
    }, []);

    const upsertFile = useCallback((file: IDEFile, options: UpsertFileOptions = {}) => {
        dispatch({ type: "UPSERT_FILE", file, options });
    }, []);

    const renameFile = useCallback((fileId: string, newName: string) => {
        dispatch({ type: "RENAME_FILE", fileId, newName });
    }, []);

    const removeFile = useCallback((fileId: string) => {
        inflightContentLoads.current.delete(fileId);
        dispatch({ type: "REMOVE_FILE", fileId });
    }, []);

    const removeFiles = useCallback((fileIds: string[]) => {
        fileIds.forEach((fileId) => inflightContentLoads.current.delete(fileId));
        dispatch({ type: "REMOVE_FILES", fileIds });
    }, []);

    const replaceFileContent = useCallback((fileId: string, content: string, markUnsaved = true) => {
        dispatch({ type: "SET_FILE_CONTENT", fileId, content, markUnsaved });
    }, []);

    const handleFileSelect = useCallback(async (fileId: string) => {
        dispatch({ type: "SELECT_FILE", fileId });

        if (Object.prototype.hasOwnProperty.call(latestStateRef.current.fileContents, fileId) || inflightContentLoads.current.has(fileId)) {
            return;
        }

        inflightContentLoads.current.add(fileId);
        try {
            const res = await fetch(`/api/files/${fileId}/raw`, { cache: "no-store" });
            const data = (await res.json().catch(() => ({}))) as { content?: unknown };

            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Failed to load file content"));
            }

            dispatch({
                type: "SET_FILE_CONTENT",
                fileId,
                content: typeof data.content === "string" ? data.content : "",
                markUnsaved: false,
            });
        } catch (error) {
            toast(error instanceof Error ? error.message : "Failed to load file content", "error");
            console.error("Failed to load file content:", error);
        } finally {
            inflightContentLoads.current.delete(fileId);
        }
    }, [toast]);

    const handleCloseFile = useCallback((e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        dispatch({ type: "CLOSE_FILE", fileId });
    }, []);

    const handleContentChange = useCallback((val: string | undefined) => {
        if (latestStateRef.current.activeFileId && val !== undefined) {
            replaceFileContent(latestStateRef.current.activeFileId, val, true);
        }
    }, [replaceFileContent]);

    const handleSave = useCallback(async () => {
        const { activeFileId, fileContents, unsavedChanges } = latestStateRef.current;
        if (!activeFileId || !unsavedChanges[activeFileId]) return;

        dispatch({ type: "SET_SAVING", isSaving: true });
        try {
            const content = fileContents[activeFileId] ?? "";
            const res = await fetch(`/api/files/${activeFileId}/raw`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                dispatch({ type: "MARK_FILE_SAVED", fileId: activeFileId, content });
                toast("File saved successfully", "success");
            } else {
                throw new Error(await getResponseErrorMessage(res, "Save failed"));
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Failed to save changes", "error");
        } finally {
            dispatch({ type: "SET_SAVING", isSaving: false });
        }
    }, [toast]);

    const { files, activeFileId, openFiles, fileContents, unsavedChanges, isSaving } = state;

    return {
        files,
        activeFileId,
        openFiles,
        fileContents,
        unsavedChanges,
        isSaving,
        upsertFile,
        renameFile,
        removeFile,
        removeFiles,
        replaceFileContent,
        setFileUnsavedState,
        handleFileSelect,
        handleCloseFile,
        handleContentChange,
        handleSave
    };
}
