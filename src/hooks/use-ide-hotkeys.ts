import { useEffect } from "react";

interface HotkeyActions {
    onSave: () => void;
    onToggleSidebar: () => void;
    onCommandPalette: () => void;
    onToggleAIChat: () => void;
    onToggleTerminal: () => void;
}

export function useIDEHotkeys({
    onSave,
    onToggleSidebar,
    onCommandPalette,
    onToggleAIChat,
    onToggleTerminal
}: HotkeyActions, dependencies: any[] = []) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCmd = e.ctrlKey || e.metaKey;

            // Don't intercept if user is typing in an input or textarea
            const target = e.target as HTMLElement;
            const isEditing = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('.monaco-editor');

            if (isCmd && !isEditing) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        onSave();
                        break;
                    case 'b':
                        e.preventDefault();
                        onToggleSidebar();
                        break;
                    case 'k':
                        e.preventDefault();
                        onCommandPalette();
                        break;
                    case 'i':
                        e.preventDefault();
                        onToggleAIChat();
                        break;
                    case '\`':
                        e.preventDefault();
                        onToggleTerminal();
                        break;
                }
            } else if (isCmd && isEditing) {
                // Allow Cmd+S and Cmd+K even when in editor
                if (e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    onSave();
                } else if (e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    onCommandPalette();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, dependencies);
}
