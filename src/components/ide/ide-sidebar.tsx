"use client";

import { FileText, FolderOpen, Search as SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { FileTreeContainer } from "./file-tree-container";
import { SourceControlPanel } from "./source-control-panel";
import type { IDEFile, IDEFileContentMap, SidebarTab } from "./shared/types";

interface IDESidebarProps {
    activeSidebarTab: SidebarTab;
    activeFileId?: string;
    activeWorkspace: string;
    workspaceOptions: string[];
    visibleFiles: IDEFile[];
    fileContents: IDEFileContentMap;
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    onWorkspaceChange: (workspace: string) => void;
    onCloseSidebar: () => void;
    onSelectFile: (fileId: string) => void;
    onFileCreated: (file: IDEFile) => void;
    onFileRenamed: (fileId: string, newName: string) => void;
    onFileDeleted: (fileId: string) => void;
    onProjectDeleteRequest: (workspace: string) => void;
}

export function IDESidebar({
    activeSidebarTab,
    activeFileId,
    activeWorkspace,
    workspaceOptions,
    visibleFiles,
    fileContents,
    searchQuery,
    onSearchQueryChange,
    onWorkspaceChange,
    onCloseSidebar,
    onSelectFile,
    onFileCreated,
    onFileRenamed,
    onFileDeleted,
    onProjectDeleteRequest,
}: IDESidebarProps) {
    const query = searchQuery.trim().toLowerCase();
    const searchResults = query.length < 2
        ? []
        : visibleFiles
            .filter((file) => {
                const content = fileContents[file.id] ?? file.content ?? "";
                return file.name.toLowerCase().includes(query) || content.toLowerCase().includes(query);
            })
            .slice(0, 50);

    return (
        <>
            <button
                type="button"
                aria-label="Close sidebar"
                className="md:hidden fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
                onClick={onCloseSidebar}
            />
            <aside className="absolute md:relative w-56 md:w-64 flex-none flex flex-col border-r border-white/[0.06] bg-[#050316] h-full overflow-hidden animate-in slide-in-from-left-1 duration-200 z-30 shadow-2xl md:shadow-none">
                <div className="p-3 border-b border-white/[0.06] bg-white/[0.015]">
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">
                        <FolderOpen className="w-3 h-3" />
                        Workspace
                    </label>
                    <select
                        value={activeWorkspace}
                        onChange={(event) => onWorkspaceChange(event.target.value)}
                        className="w-full rounded-md border border-white/[0.08] bg-black/30 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                    >
                        {workspaceOptions.map((workspace) => (
                            <option key={workspace} value={workspace}>
                                {workspace}
                            </option>
                        ))}
                    </select>
                    {activeWorkspace !== "Project" && (
                        <button
                            type="button"
                            onClick={() => onProjectDeleteRequest(activeWorkspace)}
                            className="mt-2 w-full rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-red-300/80 transition-colors hover:bg-red-500/10 hover:text-red-200"
                        >
                            Delete workspace
                        </button>
                    )}
                </div>

                {activeSidebarTab === "explorer" && (
                    <FileTreeContainer
                        activeFileId={activeFileId}
                        files={visibleFiles}
                        workspacePrefix={activeWorkspace}
                        onSelect={onSelectFile}
                        onFileCreated={onFileCreated}
                        onFileRenamed={onFileRenamed}
                        onFileDeleted={onFileDeleted}
                        onProjectDeleteRequest={onProjectDeleteRequest}
                    />
                )}

                {activeSidebarTab === "search" && (
                    <div className="flex flex-col h-full">
                        <div className="p-4 border-b border-white/[0.06]">
                            <h2 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Search</h2>
                            <div className="relative">
                                <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                <input
                                    value={searchQuery}
                                    onChange={(event) => onSearchQueryChange(event.target.value)}
                                    placeholder="Search in workspace..."
                                    className="w-full bg-black/20 border border-white/[0.08] rounded-md pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50 focus:bg-black/30 transition-colors"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {searchQuery.trim().length < 2 ? (
                                <SidebarEmptyState>Type at least 2 characters to search</SidebarEmptyState>
                            ) : searchResults.length === 0 ? (
                                <SidebarEmptyState>No results found</SidebarEmptyState>
                            ) : (
                                <div className="space-y-1">
                                    {searchResults.map((file) => (
                                        <button
                                            type="button"
                                            key={file.id}
                                            onClick={() => onSelectFile(file.id)}
                                            className={cn(
                                                "w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.06] text-left transition-colors",
                                                activeFileId === file.id ? "bg-purple-500/10 text-purple-200" : "text-white/60",
                                            )}
                                        >
                                            <FileText className="w-3.5 h-3.5 shrink-0 text-white/35" />
                                            <span className="text-[11px] truncate">{file.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeSidebarTab === "git" && <SourceControlPanel />}
            </aside>
        </>
    );
}

function SidebarEmptyState({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-full flex items-center justify-center p-4 text-center">
            <p className="text-[10px] text-white/25 uppercase tracking-wider font-bold">{children}</p>
        </div>
    );
}