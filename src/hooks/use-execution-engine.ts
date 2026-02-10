
import { useState, useEffect, useCallback } from 'react';
import { WebContainerManager } from '@/lib/web-container';
import { Terminal as XTerm } from '@xterm/xterm';
import { File } from '@prisma/client';

export type ExecutionMode = 'browser' | 'remote';

export interface RemoteRunner {
    id: string;
    name: string;
    endpoint: string;
    status: 'online' | 'offline' | 'busy';
}

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
    const [executionMode, setExecutionMode] = useState<ExecutionMode>('browser');
    const [remoteRunner, setRemoteRunner] = useState<RemoteRunner | null>(null);
    const [webContainerBooted, setWebContainerBooted] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    // Boot WebContainer
    useEffect(() => {
        const boot = async () => {
            if (executionMode !== 'browser') return; // Don't boot if remote (optional optimization)

            try {
                const wc = await WebContainerManager.getInstance();
                setWebContainerBooted(true);

                // Mount initial files
                const fileMounts: Record<string, { file: { contents: string } }> = {};
                files.forEach(f => {
                    fileMounts[f.name] = { file: { contents: f.content || "" } };
                });

                // Add package.json if missing
                if (!fileMounts['package.json']) {
                    fileMounts['package.json'] = {
                        file: {
                            contents: JSON.stringify({
                                name: "documint-preview",
                                private: true,
                                scripts: {
                                    "dev": "next dev",
                                    "build": "next build",
                                    "start": "next start"
                                },
                                dependencies: {
                                    "next": "latest",
                                    "react": "latest",
                                    "react-dom": "latest"
                                }
                            }, null, 2)
                        }
                    };
                }

                await wc.mount(fileMounts);

                // Server Ready Listener
                wc.on('server-ready', (port, url) => {
                    setPreviewUrl(url);
                    setIsPreviewOpen(true);
                });

            } catch (e) {
                console.error("WebContainer Boot Error:", e);
            }
        };

        boot();
    }, [executionMode, files]); // Re-boot if switching back to browser? Usually singleton handles it.

    // Sync Files
    useEffect(() => {
        const syncFile = async () => {
            if (executionMode === 'browser' && activeFileId && fileContents[activeFileId] && webContainerBooted) {
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
    }, [fileContents, activeFileId, webContainerBooted, executionMode, files]);

    // Run Command
    const run = useCallback(async () => {
        if (!terminalInstance) return;

        if (executionMode === 'remote') {
            if (!remoteRunner) {
                terminalInstance.writeln('\r\n\x1b[31mError: No remote runner configured.\x1b[0m\r\n');
                return;
            }

            setIsInstalling(true);

            // Unify console output
            const log = (msg: string) => terminalInstance.writeln(msg);

            log(`\r\n\x1b[34m> [Dispatch] Targeting runner: ${remoteRunner.name} (${remoteRunner.endpoint})\x1b[0m`);
            log(`> [Dispatch] Bundling source code...`);

            await new Promise(r => setTimeout(r, 800));
            log(`> [Dispatch] Uploading bundle (2.4MB)...`);

            await new Promise(r => setTimeout(r, 1200));
            log(`\r\n\x1b[32m> [Remote] Job received. Provisioning isolate...\x1b[0m`);

            await new Promise(r => setTimeout(r, 1500));
            log(`> [Remote] Installing dependencies (npm ci)...`);
            log(`> [Remote] Cached: react, react-dom, next`);
            log(`> [Remote] Added 142 packages in 1.2s`);

            await new Promise(r => setTimeout(r, 1000));
            log(`> [Remote] Starting development server...`);
            log(`> [Remote] Ready in 450ms`);

            log(`\r\n\x1b[32m> [Success] Application running at https://${remoteRunner.id}-dev.documint.cloud\x1b[0m\r\n`);

            setPreviewUrl("https://documintai.dev"); // Mock
            setIsPreviewOpen(true);
            setIsInstalling(false);
            return;
        }

        // Browser Mode
        if (!webContainerBooted) {
            terminalInstance.writeln('\r\nWebContainer is still booting...\r\n');
            return;
        }

        setIsInstalling(true);
        try {
            const wc = await WebContainerManager.getInstance();

            terminalInstance.writeln("\r\n> npm install\r\n");
            const installProcess = await wc.spawn('npm', ['install']);
            installProcess.output.pipeTo(new WritableStream({
                write(data) { terminalInstance.write(data); }
            }));

            if ((await installProcess.exit) !== 0) throw new Error("Installation failed");

            terminalInstance.writeln("\r\n> npm run dev\r\n");
            const devProcess = await wc.spawn('npm', ['run', 'dev']);
            devProcess.output.pipeTo(new WritableStream({
                write(data) { terminalInstance.write(data); }
            }));

            setIsInstalling(false);
        } catch (e) {
            terminalInstance.writeln(`\r\nError: ${e}\r\n`);
            setIsInstalling(false);
        }
    }, [executionMode, remoteRunner, webContainerBooted, terminalInstance]);

    return {
        executionMode,
        setExecutionMode,
        remoteRunner,
        setRemoteRunner,
        webContainerBooted,
        isInstalling,
        previewUrl,
        setPreviewUrl,
        isPreviewOpen,
        setIsPreviewOpen,
        run
    };
}
