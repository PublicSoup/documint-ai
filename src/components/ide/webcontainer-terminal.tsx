"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebContainerManager } from '@/lib/web-container';
import type { WebContainerProcess } from '@webcontainer/api';
import '@xterm/xterm/css/xterm.css';

interface WebContainerTerminalProps {
  onProcessStart?: (process: WebContainerProcess) => void;
  onProcessExit?: (code: number | null) => void;
  onError?: (error: Error) => void;
}

export const WebContainerTerminal = ({
  onProcessStart,
  onProcessExit,
  onError
}: WebContainerTerminalProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webLinksAddonRef = useRef<WebLinksAddon | null>(null);
  
  const [currentProcess, setCurrentProcess] = useState<WebContainerProcess | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [healthStatus, setHealthStatus] = useState(WebContainerManager.getHealthSnapshot());
  const lastHealthRef = useRef(healthStatus);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#020010',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selectionBackground: '#3b82f6',
      },
      fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      letterSpacing: 0,
      allowProposedApi: true,
    });

    // Initialize addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    fitAddonRef.current = fitAddon;
    webLinksAddonRef.current = webLinksAddon;
    
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    setIsReady(true);

    // Handle resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Initial greeting
    term.writeln('Welcome to DocuMint AI Terminal');
    term.writeln('Type commands to execute them in the WebContainer sandbox');
    term.writeln('');
    writePrompt(term);

    const unsubscribe = WebContainerManager.subscribeToHealth((health) => {
        // Only log if a new recovery occurred and there's a specific reason
        if (health.recoveryCount > lastHealthRef.current.recoveryCount && health.lastRecoveryReason) {
            term.writeln(`\r\n[System] WebContainer recovered due to: ${health.lastRecoveryReason}`);
            writePrompt(term);
        }
        lastHealthRef.current = health;
        setHealthStatus(health);
    });

    // Handle terminal input
    let currentCommand = '';
    
    term.onData((data) => {
      const printable = !(data.charCodeAt(0) < 32) && data.charCodeAt(0) !== 127;
      
      if (data.charCodeAt(0) === 13) {
        // Enter key
        term.write('\r\n');
        handleCommand(currentCommand.trim(), term);
        currentCommand = '';
      } else if (data.charCodeAt(0) === 8) {
        // Backspace
        if (currentCommand.length > 0) {
          currentCommand = currentCommand.slice(0, -1);
          term.write('\b \b');
        }
      } else if (printable) {
        currentCommand += data;
        term.write(data);
      }
    });

    return () => {
      unsubscribe(); // Unsubscribe from health updates
      window.removeEventListener('resize', handleResize);
      if (currentProcess) {
        currentProcess.kill();
      }
      term.dispose();
    };
  }, []); // Run once on mount

  const writePrompt = (term: XTerm) => {
    term.write('\r\n$ ');
  };

  const handleCommand = async (command: string, term: XTerm) => {
    if (!command.trim()) {
      writePrompt(term);
      return;
    }

    // Handle built-in commands
    if (command === 'clear' || command === 'cls') {
      term.clear();
      writePrompt(term);
      return;
    }

    if (command === 'exit' && currentProcess) {
      currentProcess.kill();
      setCurrentProcess(null);
      term.writeln('Process terminated');
      writePrompt(term);
      return;
    }

    try {
      // Basic security filter
      const [cmd, ...args] = command.split(' ');
      const lowerCmd = cmd.toLowerCase();
      
      const blocked = [
        'rm', 'kill', 'halt', 'reboot', 'shutdown', 'poweroff', 'init',
        'curl', 'wget', 'nc', 'telnet', 'ssh'
      ];
      if (blocked.includes(lowerCmd) || command.includes(':(){ :|:& };:')) {
        term.writeln(`\r\n\x1b[31m[Security] Command blocked for safety: ${cmd}\x1b[0m`);
        writePrompt(term);
        return;
      }
      
      term.writeln(`\r\nRunning: ${command}`);
      
      const process = await WebContainerManager.spawn(cmd, { args });
      setCurrentProcess(process);
      
      onProcessStart?.(process);

      // Stream output to terminal
      process.output.pipeTo(new WritableStream({
        write(data) {
          term.write(data);
        }
      }));



      // Handle process exit
      process.exit.then((code) => {
        setCurrentProcess(null);
        term.write(`\r\nProcess exited with code: ${code ?? 'unknown'}`);
        onProcessExit?.(code);
        writePrompt(term);
      }).catch((error) => {
        setCurrentProcess(null);
        term.write(`\r\nProcess error: ${error.message}`);
        onError?.(error);
        writePrompt(term);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      term.write(`\r\nError: ${errorMessage}`);
      onError?.(error instanceof Error ? error : new Error(errorMessage));
      writePrompt(term);
    }
  };

  // Fit terminal on mount
  useEffect(() => {
    if (fitAddonRef.current && terminalRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    }
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-[#020010] rounded-lg border border-white/10">
      {/* Terminal Header */}
      <div className="flex-none h-8 bg-[#13131a] border-b border-white/5 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Live Terminal</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-white/40">
          {healthStatus.recoveryCount > 0 && healthStatus.lastRecoveryAt && !currentProcess ? (
            <><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Recovering...</>
          ) : currentProcess ? (
            <><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Running</>
          ) : (
            <><div className="w-2 h-2 rounded-full bg-gray-500" /> Ready</>
          )}
        </div>
      </div>
      
      {/* Terminal */}
      <div ref={terminalRef} className="flex-1 w-full overflow-hidden" />
    </div>
  );
};