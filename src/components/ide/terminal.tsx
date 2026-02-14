"use client";

import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
    onTerminalReady?: (terminal: XTerm) => void;
}

export const Terminal = ({ onTerminalReady }: TerminalProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);

    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;

        const term = new XTerm({
            cursorBlink: true,
            theme: {
                background: '#020010',
                foreground: '#ffffff',
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 12,
            rows: 10, // Initial rows, will fit automatically
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;

        if (onTerminalReady) {
            onTerminalReady(term);
        }

        // Handle resize
        const handleResize = () => fitAddon.fit();
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            term.dispose();
        };
    }, []);

    return <div ref={terminalRef} className="h-full w-full overflow-hidden" />;
};
