
import { useState, useEffect, useCallback, useRef } from 'react';
import { WebContainerManager } from '@/lib/web-container';
import { Terminal as XTerm } from '@xterm/xterm';
import { File } from '@prisma/client';

export type RunStatus = 'idle' | 'installing' | 'starting' | 'ready' | 'error';

interface UseExecutionEngineProps {
    files: (File & { content?: string | null })[];
    activeFileId?: string;
    fileContents: Record<string, string>;
    terminalInstance: XTerm | null;
}

export function useExecutionEngine({
    files,
    activeFileId,
    fileContents,
    terminalInstance
}: UseExecutionEngineProps) {
    // State
    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [webContainerBooted, setWebContainerBooted] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    // Refs to break closure for async execution
    const termRef = useRef<XTerm | null>(terminalInstance);
    const bootedRef = useRef<boolean>(webContainerBooted);

    useEffect(() => {
        termRef.current = terminalInstance;
    }, [terminalInstance]);

    useEffect(() => {
        bootedRef.current = webContainerBooted;
    }, [webContainerBooted]);

    const mountAll = useCallback(async (fileList: (File & { content?: string | null })[]) => {
        const fileMounts: Record<string, any> = {};

        const ensureDir = (root: any, pathParts: string[]) => {
            let current = root;
            for (const part of pathParts) {
                if (!current[part]) {
                    current[part] = { directory: {} };
                }
                current = current[part].directory;
            }
            return current;
        };

        fileList.forEach(f => {
            let name = f.name;
            if (!name) return;
            name = name.trim();

            if (name.startsWith('//') || name.startsWith('#') || name.includes('\n') || !name.match(/^[a-zA-Z0-9@._\-\/]+$/)) {
                return;
            }

            if (name.includes('/')) {
                const parts = name.split('/');
                const fileName = parts.pop()!;
                const dir = ensureDir(fileMounts, parts);
                dir[fileName] = { file: { contents: f.content || "" } };
            } else {
                fileMounts[name] = { file: { contents: f.content || "" } };
            }
        });

        if (!fileMounts['package.json']) {
            fileMounts['package.json'] = {
                file: {
                    contents: JSON.stringify({
                        name: "documint-preview",
                        private: true,
                        scripts: { "dev": "next dev", "build": "next build", "start": "next start" },
                        dependencies: { "next": "latest", "react": "latest", "react-dom": "latest" }
                    }, null, 2)
                }
            };
        }

        await WebContainerManager.mountFiles(fileMounts);
    }, []);

    // Boot WebContainer
    useEffect(() => {
        const boot = async () => {
            try {
                const wc = await WebContainerManager.getInstance();
                setWebContainerBooted(true);

                // Mount initial files
                await mountAll(files);

                // Server Ready Listener
                wc.on('server-ready', (port, url) => {
                    setPreviewUrl(url);
                    setRunStatus('ready');
                    setIsPreviewOpen(true);
                });

            } catch (e) {
                console.error("WebContainer Boot Error:", e);
                setRunStatus('error');
            }
        };

        boot();
    }, [files, mountAll]);

    // Sync Files
    useEffect(() => {
        const syncFile = async () => {
            if (activeFileId && fileContents[activeFileId] && webContainerBooted) {
                const file = files.find(f => f.id === activeFileId);
                if (file) {
                    try {
                        await WebContainerManager.writeFile(file.name, fileContents[activeFileId]);
                    } catch (e) {
                        console.error("Failed to sync file to WC:", e);
                    }
                }
            }
        };
        const timeout = setTimeout(syncFile, 500);
        return () => clearTimeout(timeout);
    }, [fileContents, activeFileId, webContainerBooted, files]);

    // Run Command
    const run = useCallback(async () => {
        // Await terminal initialization (solves UI optimism race condition)
        let term = termRef.current;
        if (!term) {
            for (let i = 0; i < 20; i++) { // wait up to 2 seconds
                await new Promise(r => setTimeout(r, 100));
                if (termRef.current) {
                    term = termRef.current;
                    break;
                }
            }
        }
        
        if (!term) {
            console.error("Terminal instance never materialized");
            return;
        }

        // Await WebContainer boot
        let isBooted = bootedRef.current;
        if (!isBooted) {
            term.writeln('\r\nWaiting for WebContainer to boot...\r\n');
            for (let i = 0; i < 50; i++) { // wait up to 10 seconds
                await new Promise(r => setTimeout(r, 200));
                if (bootedRef.current) {
                    isBooted = true;
                    break;
                }
            }
        }

        if (!isBooted) {
            term.writeln('\r\nError: WebContainer failed to boot in time.\r\n');
            setRunStatus('error');
            return;
        }

        setRunStatus('installing');
        try {
            const wc = await WebContainerManager.getInstance();

            // Detect framework strategy
            const packageJsonFile = files.find(f => f.name === 'package.json');
            
            if (packageJsonFile) {
                // Node.js project
                term.writeln("\r\n> npm install\r\n");
                const installProcess = await wc.spawn('npm', ['install']);
                installProcess.output.pipeTo(new WritableStream({
                    write(data) { term.write(data); }
                }));

                if ((await installProcess.exit) !== 0) {
                    setRunStatus('error');
                    throw new Error("Installation failed");
                }

                setRunStatus('starting');
                
                // Read processed package.json
                const pkgJsonStr = packageJsonFile.content || "{}";
                let hasDevScript = false;
                let hasStartScript = false;
                try {
                    const parsed = JSON.parse(pkgJsonStr);
                    hasDevScript = !!parsed?.scripts?.dev;
                    hasStartScript = !!parsed?.scripts?.start;
                } catch { }

                let runCmd = ['run', 'dev'];
                if (!hasDevScript && hasStartScript) runCmd = ['start'];
                else if (!hasDevScript && !hasStartScript) {
                    term.writeln("\r\n> No scripts.dev or scripts.start found. Attempting fallback: npx serve .\r\n");
                    const serveProcess = await wc.spawn('npx', ['serve', '.']);
                    serveProcess.output.pipeTo(new WritableStream({ write(data) { term.write(data); } }));
                    return; // Server ready will trigger
                }

                term.writeln(`\r\n> npm ${runCmd.join(' ')}\r\n`);
                const devProcess = await wc.spawn('npm', runCmd);
                devProcess.output.pipeTo(new WritableStream({
                    write(data) { term.write(data); }
                }));
            } else {
                // Static HTML fallback
                setRunStatus('starting');
                term.writeln("\r\n> npx serve .\r\n");
                const serveProcess = await wc.spawn('npx', ['serve', '.']);
                serveProcess.output.pipeTo(new WritableStream({
                    write(data) { term.write(data); }
                }));
            }
        } catch (e) {
            if (termRef.current) {
                termRef.current.writeln(`\r\nError: ${e}\r\n`);
            }
            setRunStatus('error');
        }
    }, [files]);

    return {
        runStatus,
        webContainerBooted,
        previewUrl,
        setPreviewUrl,
        isPreviewOpen,
        setIsPreviewOpen,
        run,
        mountAll
    };
}
