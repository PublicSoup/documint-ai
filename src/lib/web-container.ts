import { WebContainer } from '@webcontainer/api';

// Singleton instance
let webcontainerInstance: WebContainer | null = null;

export class WebContainerManager {
    static async getInstance(): Promise<WebContainer> {
        if (!webcontainerInstance) {
            try {
                webcontainerInstance = await WebContainer.boot();
            } catch (error) {
                console.error("Failed to boot WebContainer:", error);
                throw error;
            }
        }
        return webcontainerInstance;
    }

    static async mountFiles(files: Record<string, { file: { contents: string } }>) {
        const instance = await this.getInstance();
        await instance.mount(files);
    }

    static async writeFile(path: string, content: string) {
        const instance = await this.getInstance();
        await instance.fs.writeFile(path, content);
    }

    static async readFile(path: string): Promise<string> {
        const instance = await this.getInstance();
        const content = await instance.fs.readFile(path, 'utf-8');
        return content;
    }
}
