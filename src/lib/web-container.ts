import { WebContainer, WebContainerProcess } from "@webcontainer/api";

type MountTree = Record<string, { file: { contents: string } } | { directory: MountTree }>;

interface SpawnOptions {
    args?: string[];
    processId?: string;
}

const MAX_BOOT_RETRIES = 3;
const BASE_BACKOFF_MS = 400;
const DEFAULT_OP_TIMEOUT_MS = 15_000;

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const trackedProcesses = new Map<string, WebContainerProcess>();

function trackProcess(processId: string, process: WebContainerProcess): void {
    trackedProcesses.set(processId, process);

    process.exit
        .catch(() => {
            // Swallow process exit errors; tracking cleanup still applies.
        })
        .finally(() => {
            if (trackedProcesses.get(processId) === process) {
                trackedProcesses.delete(processId);
            }
        });
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoff(attempt: number): number {
    return BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            const timeoutError = new Error(`WebContainer ${operation} timed out after ${timeoutMs}ms`);
            setTimeout(() => reject(timeoutError), timeoutMs);
        }),
    ]);
}

export class WebContainerManager {
    private static async runWithRecovery<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
        try {
            return await withTimeout(operation(), DEFAULT_OP_TIMEOUT_MS, operationName);
        } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : "";
            const isRecoverable = message.includes("webcontainer") || message.includes("timed out") || message.includes("closed");

            if (!isRecoverable) {
                throw error;
            }

            await this.reset();
            return await withTimeout(operation(), DEFAULT_OP_TIMEOUT_MS, `${operationName} (retry)`);
        }
    }

    static async getInstance(): Promise<WebContainer> {
        if (webcontainerInstance) {
            return webcontainerInstance;
        }

        if (bootPromise) {
            return bootPromise;
        }

        bootPromise = this.bootWithRetry();

        try {
            webcontainerInstance = await bootPromise;
            return webcontainerInstance;
        } finally {
            bootPromise = null;
        }
    }

    private static async bootWithRetry(): Promise<WebContainer> {
        let lastError: unknown = null;

        for (let attempt = 1; attempt <= MAX_BOOT_RETRIES; attempt += 1) {
            try {
                return await WebContainer.boot();
            } catch (error) {
                lastError = error;
                if (attempt < MAX_BOOT_RETRIES) {
                    await sleep(nextBackoff(attempt));
                }
            }
        }

        throw lastError instanceof Error ? lastError : new Error("Failed to boot WebContainer");
    }

    static async mountFiles(files: MountTree): Promise<void> {
        await this.runWithRecovery(async () => {
            const instance = await this.getInstance();
            await instance.mount(files);
        }, "mount files");
    }

    static async writeFile(path: string, content: string): Promise<void> {
        writeQueue = writeQueue.then(async () => {
            await this.runWithRecovery(async () => {
                const instance = await this.getInstance();
                await instance.fs.writeFile(path, content);
            }, `write file ${path}`);
        });

        return writeQueue;
    }

    static async readFile(path: string): Promise<string> {
        return await this.runWithRecovery(async () => {
            const instance = await this.getInstance();
            const content = await instance.fs.readFile(path, "utf-8");
            return content;
        }, `read file ${path}`);
    }

    static async spawn(command: string, options: SpawnOptions = {}): Promise<WebContainerProcess> {
        const process = await this.runWithRecovery(async () => {
            const instance = await this.getInstance();
            return await instance.spawn(command, options.args ?? []);
        }, `spawn ${command}`);

        if (options.processId) {
            trackProcess(options.processId, process);
        }

        return process;
    }

    static async killProcess(processId: string): Promise<void> {
        const process = trackedProcesses.get(processId);
        if (!process) {
            return;
        }

        try {
            process.kill();
        } finally {
            trackedProcesses.delete(processId);
        }
    }

    static async stopAllProcesses(): Promise<void> {
        const entries = [...trackedProcesses.entries()];

        for (const [processId, process] of entries) {
            try {
                process.kill();
            } finally {
                trackedProcesses.delete(processId);
            }
        }
    }

    static async reset(): Promise<void> {
        await this.stopAllProcesses();
        webcontainerInstance = null;
        bootPromise = null;
        writeQueue = Promise.resolve();
    }
}
