"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebContainerManager } from '@/lib/web-container';
import type { WebContainerProcess } from '@webcontainer/api';
import '@xterm/xterm/css/xterm.css';

const BLOCKED_COMMANDS = new Set([
  'rm', 'kill', 'halt', 'reboot', 'shutdown', 'poweroff', 'init',
  'curl', 'wget', 'nc', 'telnet', 'ssh'
]);

const BUILTIN_COMMANDS = ['clear', 'cls', 'exit'];

function writePrompt(term: XTerm) {
  term.write('\r\n$ ');
}

function splitCommand(command: string): string[] {
  const tokens: string[] = [];
  const matcher = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(command)) !== null) {
    const token = match[1] ?? match[2] ?? match[0];
    tokens.push(token.replace(/\\(["'])/g, '$1'));
  }

  return tokens;
}

function isBlockedCommand(command: string, cmd: string): boolean {
  return BLOCKED_COMMANDS.has(cmd.toLowerCase()) || command.includes(':(){ :|:& };:');
}

function getTabCompletion(command: string): string | null {
  if (!command || command.includes(' ')) return null;
  const match = BUILTIN_COMMANDS.find((item) => item.startsWith(command));
  return match && match !== command ? match.slice(command.length) : null;
}

interface WebContainerTerminalProps {
  onProcessStart?: (process: WebContainerProcess) => void;
  onProcessExit?: (code: number | null) => void;
  onError?: (error: Error) => void;
  onReady?: (terminal: XTerm) => void;
  onBeforeCommand?: () => Promise<{ cwd?: string } | void>;
  disabled?: boolean;
}

export const WebContainerTerminal = ({
  onProcessStart,
  onProcessExit,
  onError,
  onReady,
  onBeforeCommand,
  disabled = false
}: WebContainerTerminalProps) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webLinksAddonRef = useRef<WebLinksAddon | null>(null);
  const currentProcessRef = useRef<WebContainerProcess | null>(null);
  const callbacksRef = useRef({ onProcessStart, onProcessExit, onError, onReady, onBeforeCommand });
  const disposedRef = useRef(false);
  
  const [currentProcess, setCurrentProcess] = useState<WebContainerProcess | null>(null);
  const [healthStatus, setHealthStatus] = useState(WebContainerManager.getHealthSnapshot());
  const lastHealthRef = useRef(healthStatus);

  useEffect(() => {
    callbacksRef.current = { onProcessStart, onProcessExit, onError, onReady, onBeforeCommand };
  }, [onBeforeCommand, onError, onProcessExit, onProcessStart, onReady]);

  const updateCurrentProcess = useCallback((process: WebContainerProcess | null) => {
    currentProcessRef.current = process;
    setCurrentProcess(process);
  }, []);

  const stopCurrentProcess = useCallback((term: XTerm) => {
    const process = currentProcessRef.current;
    if (process) {
      process.kill();
      updateCurrentProcess(null);
      term.write('^C\r\n');
      writePrompt(term);
      return;
    }

    term.write('^C\r\n');
    writePrompt(term);
  }, [updateCurrentProcess]);

  const handleCommand = useCallback(async (command: string, term: XTerm) => {
    if (!command.trim()) {
      writePrompt(term);
      return;
    }

    if (disabled) {
      term.writeln('\r\nTerminal input is temporarily disabled.');
      writePrompt(term);
      return;
    }

    // Handle built-in commands
    if (command === 'clear' || command === 'cls') {
      term.clear();
      writePrompt(term);
      return;
    }

    if (command === 'exit') {
      const process = currentProcessRef.current;
      if (process) {
        process.kill();
        updateCurrentProcess(null);
        term.writeln('Process terminated');
      }
      writePrompt(term);
      return;
    }

    try {
      const [cmd, ...args] = splitCommand(command);
      if (!cmd) {
        writePrompt(term);
        return;
      }
      
      if (isBlockedCommand(command, cmd)) {
        term.writeln(`\r\n\x1b[31m[Security] Command blocked for safety: ${cmd}\x1b[0m`);
        writePrompt(term);
        return;
      }
      
      term.writeln(`\r\nPreparing workspace...`);
      const commandContext = await callbacksRef.current.onBeforeCommand?.();
      term.writeln(`Running: ${command}`);
      
      const process = await WebContainerManager.spawn(cmd, {
        args,
        processId: `terminal-${Date.now().toString(36)}`,
        cwd: commandContext?.cwd,
      });
      updateCurrentProcess(process);
      callbacksRef.current.onProcessStart?.(process);

      void process.output.pipeTo(new WritableStream({
        write(data) {
          if (!disposedRef.current) term.write(data);
        }
      })).catch((error: unknown) => {
        if (disposedRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        term.write(`\r\nOutput stream error: ${message}`);
      });

      void process.exit.then((code) => {
        if (disposedRef.current) return;
        if (currentProcessRef.current === process) updateCurrentProcess(null);
        term.write(`\r\nProcess exited with code: ${code ?? 'unknown'}`);
        callbacksRef.current.onProcessExit?.(code);
        writePrompt(term);
      }).catch((error: unknown) => {
        if (disposedRef.current) return;
        if (currentProcessRef.current === process) updateCurrentProcess(null);
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        term.write(`\r\nProcess error: ${normalizedError.message}`);
        callbacksRef.current.onError?.(normalizedError);
        writePrompt(term);
      });

    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown error');
      term.write(`\r\nError: ${normalizedError.message}`);
      callbacksRef.current.onError?.(normalizedError);
      writePrompt(term);
    }
  }, [disabled, updateCurrentProcess]);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;
    disposedRef.current = false;

    const term = new XTerm({
      disableStdin: disabled,
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
    callbacksRef.current.onReady?.(term);

    // Handle resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Initial greeting
    term.writeln('Welcome to DocuMint AI Terminal');
    term.writeln('Type commands to execute them in the WebContainer sandbox');
    term.writeln('');
    writePrompt(term);

    const unsubscribeHealth = WebContainerManager.subscribeToHealth((health) => {
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
    
    const dataDisposable = term.onData((data) => {
      if (disabled) return;

      for (const char of data) {
        const charCode = char.charCodeAt(0);

        if (charCode === 13) {
          term.write('\r\n');
          void handleCommand(currentCommand.trim(), term);
          currentCommand = '';
        } else if (charCode === 3) {
          currentCommand = '';
          stopCurrentProcess(term);
        } else if (charCode === 9) {
          const completion = getTabCompletion(currentCommand);
          if (completion) {
            currentCommand += completion;
            term.write(completion);
          }
        } else if (charCode === 8 || charCode === 127) {
          if (currentCommand.length > 0) {
            currentCommand = currentCommand.slice(0, -1);
            term.write('\b \b');
          }
        } else if (charCode >= 32 && charCode !== 127) {
          currentCommand += char;
          term.write(char);
        }
      }
    });

    return () => {
      disposedRef.current = true;
      unsubscribeHealth();
      dataDisposable.dispose();
      window.removeEventListener('resize', handleResize);
      const process = currentProcessRef.current;
      if (process) {
        process.kill();
        updateCurrentProcess(null);
      }
      term.dispose();
      xtermRef.current = null;
    };
  }, [disabled, handleCommand, stopCurrentProcess, updateCurrentProcess]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.disableStdin = disabled;
    }
  }, [disabled]);

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