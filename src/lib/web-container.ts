import { WebContainer, WebContainerProcess } from "@webcontainer/api";

type MountTree = Record<string, { file: { contents: string } } | { directory: MountTree }>;

interface SpawnOptions {
    args?: string[];
    processId?: string;
}

const MAX_BOOT_RETRIES = 3;
const BASE_BACKOFF_MS = 400;

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const trackedProcesses = new Map<string, WebContainerProcess>();

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoff(attempt: number): number {
    return BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
}

export class WebContainerManager {
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
        const instance = await this.getInstance();
        await instance.mount(files);
    }

    static async writeFile(path: string, content: string): Promise<void> {
        writeQueue = writeQueue.then(async () => {
            const instance = await this.getInstance();
            await instance.fs.writeFile(path, content);
        });

        return writeQueue;
    }

    static async readFile(path: string): Promise<string> {
        const instance = await this.getInstance();
        const content = await instance.fs.readFile(path, "utf-8");
        return content;
    }

    static async spawn(command: string, options: SpawnOptions = {}): Promise<WebContainerProcess> {
        const instance = await this.getInstance();
        const process = await instance.spawn(command, options.args ?? []);

        if (options.processId) {
            trackedProcesses.set(options.processId, process);
        }

        return process;
    }

    static async killProcess(processId: string): Promise<void> {
        const process = trackedProcesses.get(processId);
        if (!process) {
            return;
        }

        process.kill();
        trackedProcesses.delete(processId);
    }

    static async stopAllProcesses(): Promise<void> {
        for (const [processId, process] of trackedProcesses.entries()) {
            process.kill();
            trackedProcesses.delete(processId);
        }
    }

    static async reset(): Promise<void> {
        await this.stopAllProcesses();
        webcontainerInstance = null;
        bootPromise = null;
        writeQueue = Promise.resolve();
    }
}
