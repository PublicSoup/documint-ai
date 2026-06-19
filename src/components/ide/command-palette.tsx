"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search,
  File as FileIcon,
  CornerDownLeft,
  Terminal,
  Keyboard,
  Settings,
  Columns,
  Map,
  Eye,
  Sparkles,
  Play,
  Hammer,
  FlaskConical,
} from "lucide-react";
import type { IDEFile } from "./shared/types";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: IDEFile[];
  onSelectFile: (fileId: string) => void;
  onRunCommand?: (commandId: string) => void;
  runtimeAvailability?: {
    canRun: boolean;
    canBuild: boolean;
    canTest: boolean;
    runDisabledReason?: string;
    buildDisabledReason?: string;
    testDisabledReason?: string;
  };
}

interface Command {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabledReason?: string;
}

const COMMANDS: Command[] = [
  {
    id: "run-project",
    label: "Run / Preview Project",
    category: "Runtime",
    icon: <Play className="w-4 h-4" />,
    shortcut: "Ctrl+Enter",
  },
  {
    id: "build-project",
    label: "Build Project",
    category: "Runtime",
    icon: <Hammer className="w-4 h-4" />,
  },
  {
    id: "test-project",
    label: "Test Project",
    category: "Runtime",
    icon: <FlaskConical className="w-4 h-4" />,
  },
  {
    id: "toggle-terminal",
    label: "Toggle Terminal",
    category: "View",
    icon: <Terminal className="w-4 h-4" />,
    shortcut: "Ctrl+`",
  },
  {
    id: "toggle-minimap",
    label: "Toggle Minimap",
    category: "View",
    icon: <Map className="w-4 h-4" />,
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    category: "View",
    icon: <Columns className="w-4 h-4" />,
    shortcut: "Ctrl+B",
  },
  {
    id: "format-document",
    label: "Format Document",
    category: "Edit",
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    id: "go-to-settings",
    label: "Open Keyboard Shortcuts",
    category: "Preferences",
    icon: <Settings className="w-4 h-4" />,
  },
  {
    id: "toggle-wordwrap",
    label: "Toggle Word Wrap",
    category: "View",
    icon: <Eye className="w-4 h-4" />,
  },
  {
    id: "keyboard-shortcuts",
    label: "Keyboard Shortcuts Reference",
    category: "Help",
    icon: <Keyboard className="w-4 h-4" />,
  },
];

export function CommandPalette({
  isOpen,
  onClose,
  files,
  onSelectFile,
  onRunCommand,
  runtimeAvailability,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isCommandMode = query.startsWith(">");
  const searchQuery = isCommandMode ? query.slice(1).trim() : query;

  const filteredFiles = useMemo(() => {
    if (isCommandMode) return [];
    if (!searchQuery) return files.slice(0, 10);
    return files
      .filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 10);
  }, [files, searchQuery, isCommandMode]);

  const filteredCommands = useMemo(() => {
    const commands = COMMANDS.map((command) => {
      if (
        command.id === "run-project" &&
        runtimeAvailability &&
        !runtimeAvailability.canRun
      ) {
        return {
          ...command,
          disabledReason:
            runtimeAvailability.runDisabledReason || "Runtime is busy",
        };
      }
      if (
        command.id === "build-project" &&
        runtimeAvailability &&
        !runtimeAvailability.canBuild
      ) {
        return {
          ...command,
          disabledReason:
            runtimeAvailability.buildDisabledReason || "Build unavailable",
        };
      }
      if (
        command.id === "test-project" &&
        runtimeAvailability &&
        !runtimeAvailability.canTest
      ) {
        return {
          ...command,
          disabledReason:
            runtimeAvailability.testDisabledReason || "Test unavailable",
        };
      }
      return command;
    });

    if (!isCommandMode) return [];
    if (!searchQuery) return commands;
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.category.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery, isCommandMode, runtimeAvailability]);

  const totalItems = isCommandMode
    ? filteredCommands.length
    : filteredFiles.length;
  const activeIndex = Math.min(selectedIndex, Math.max(0, totalItems - 1));

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, Math.max(0, totalItems - 1)),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (isCommandMode) {
          const cmd = filteredCommands[activeIndex];
          if (cmd && !cmd.disabledReason) {
            onRunCommand?.(cmd.id);
            onClose();
          }
        } else {
          if (filteredFiles[activeIndex]) {
            onSelectFile(filteredFiles[activeIndex].id);
            onClose();
          }
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isOpen,
    filteredFiles,
    filteredCommands,
    activeIndex,
    onSelectFile,
    onRunCommand,
    onClose,
    isCommandMode,
    totalItems,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-white/5 gap-3">
          <Search className="w-5 h-5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={
              isCommandMode
                ? "Type a command..."
                : "Search files... (type > for commands)"
            }
            className="flex-1 bg-transparent text-lg text-white placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground">
            ESC
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto py-2">
          {isCommandMode ? (
            /* Command list mode */
            filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No commands found.
              </div>
            ) : (
              filteredCommands.map((cmd, i) => (
                <div
                  key={cmd.id}
                  onClick={() => {
                    if (cmd.disabledReason) return;
                    onRunCommand?.(cmd.id);
                    onClose();
                  }}
                  title={cmd.disabledReason || cmd.label}
                  className={cn(
                    "px-4 py-2 flex items-center gap-3 text-sm",
                    cmd.disabledReason
                      ? "cursor-not-allowed opacity-45"
                      : "cursor-pointer",
                    i === activeIndex
                      ? "bg-primary/20 text-white"
                      : "text-muted-foreground hover:bg-white/5",
                  )}
                >
                  <span className="text-white/40">{cmd.icon}</span>
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.disabledReason && (
                    <span className="max-w-[160px] truncate text-[10px] text-amber-300/70">
                      {cmd.disabledReason}
                    </span>
                  )}
                  <span className="text-[10px] text-white/20">
                    {cmd.category}
                  </span>
                  {cmd.shortcut && (
                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40 font-mono">
                      {cmd.shortcut}
                    </span>
                  )}
                  {i === activeIndex && (
                    <CornerDownLeft className="w-3.5 h-3.5 opacity-50" />
                  )}
                </div>
              ))
            )
          ) : /* File search mode */
          filteredFiles.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No files found.
            </div>
          ) : (
            filteredFiles.map((file, i) => (
              <div
                key={file.id}
                onClick={() => {
                  onSelectFile(file.id);
                  onClose();
                }}
                className={cn(
                  "px-4 py-2 flex items-center gap-3 cursor-pointer text-sm",
                  i === activeIndex
                    ? "bg-primary/20 text-white"
                    : "text-muted-foreground hover:bg-white/5",
                )}
              >
                <FileIcon className="w-4 h-4" />
                <span className="flex-1 truncate">{file.name}</span>
                {i === activeIndex && (
                  <CornerDownLeft className="w-3.5 h-3.5 opacity-50" />
                )}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 bg-white/5 border-t border-white/5 flex items-center justify-between text-[10px] text-muted-foreground">
          <div>
            <span className="text-white">↑↓</span> to navigate
          </div>
          <div className="flex gap-4">
            <div>
              <span className="text-white">↵</span> to select
            </div>
            {!isCommandMode && (
              <div>
                <span className="text-white">&gt;</span> for commands
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
