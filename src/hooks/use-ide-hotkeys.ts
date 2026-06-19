import { useEffect, useRef } from "react";

interface HotkeyActions {
    onSave: () => void;
    onToggleSidebar: () => void;
    onCommandPalette: () => void;
    onToggleAIChat: () => void;
    onToggleTerminal: () => void;
    onRun: () => void;
}

export function useIDEHotkeys({
    onSave,
    onToggleSidebar,
    onCommandPalette,
    onToggleAIChat,
    onToggleTerminal,
    onRun
}: HotkeyActions) {
    const actionsRef = useRef<HotkeyActions>({
        onSave,
        onToggleSidebar,
        onCommandPalette,
        onToggleAIChat,
        onToggleTerminal,
        onRun,
    });

    useEffect(() => {
        actionsRef.current = {
            onSave,
            onToggleSidebar,
            onCommandPalette,
            onToggleAIChat,
            onToggleTerminal,
            onRun,
        };
    }, [onSave, onToggleSidebar, onCommandPalette, onToggleAIChat, onToggleTerminal, onRun]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;

            const isCmd = e.ctrlKey || e.metaKey;
            const actions = actionsRef.current;

            // Don't intercept if user is typing in an input or textarea
            const target = e.target as HTMLElement;
            const isEditing = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('.monaco-editor');

            if (isCmd && !isEditing) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    actions.onRun();
                    return;
                }

                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        actions.onSave();
                        break;
                    case 'b':
                        e.preventDefault();
                        actions.onToggleSidebar();
                        break;
                    case 'k':
                        e.preventDefault();
                        actions.onCommandPalette();
                        break;
                    case 'i':
                        e.preventDefault();
                        actions.onToggleAIChat();
                        break;
                    case '\`':
                        e.preventDefault();
                        actions.onToggleTerminal();
                        break;
                }
            } else if (isCmd && isEditing) {
                // Allow Cmd+S, Cmd+K, and Cmd+Enter even when in editor.
                if (e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    actions.onSave();
                } else if (e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    actions.onCommandPalette();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    actions.onRun();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
}
