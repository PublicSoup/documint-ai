/**
 * Local Development Storage
 * Provides file storage for dev mode when database is unavailable.
 * Files are stored in a local .dev-workspace directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const DEV_WORKSPACE_DIR = path.join(process.cwd(), '.dev-workspace');

// In-memory file store for session persistence (simple Map-based storage)
const inMemoryFiles = new Map<string, {
    id: string;
    name: string;
    content: string;
    language: string;
    createdAt: Date;
    updatedAt: Date;
}>();

// Initialize workspace directory
async function ensureWorkspaceDir(): Promise<void> {
    try {
        await fs.mkdir(DEV_WORKSPACE_DIR, { recursive: true });
    } catch (e) {
        // Directory likely exists
    }
}

// Generate a simple ID
function generateId(): string {
    return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Detect language from filename
function detectLanguage(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const languageMap: Record<string, string> = {
        '.ts': 'typescript',
        '.tsx': 'typescriptreact',
        '.js': 'javascript',
        '.jsx': 'javascriptreact',
        '.py': 'python',
        '.java': 'java',
        '.go': 'go',
        '.rs': 'rust',
        '.css': 'css',
        '.html': 'html',
        '.json': 'json',
        '.md': 'markdown',
        '.yaml': 'yaml',
        '.yml': 'yaml',
    };
    return languageMap[ext] || 'plaintext';
}

export async function createLocalFile(name: string, content: string = ''): Promise<{
    id: string;
    name: string;
    content: string;
    language: string;
    createdAt: Date;
    updatedAt: Date;
}> {
    await ensureWorkspaceDir();

    const id = generateId();
    const language = detectLanguage(name);
    const now = new Date();

    const file = {
        id,
        name,
        content,
        language,
        createdAt: now,
        updatedAt: now,
    };

    // Store in memory
    inMemoryFiles.set(id, file);

    // Also write to disk for persistence
    const filePath = path.join(DEV_WORKSPACE_DIR, name);
    await fs.writeFile(filePath, content, 'utf-8');

    console.log(`📁 [Local Dev] Created file: ${name} (${id})`);
    return file;
}

export async function getLocalFile(id: string): Promise<{
    id: string;
    name: string;
    content: string;
    language: string;
} | null> {
    const file = inMemoryFiles.get(id);
    if (!file) return null;

    // Read latest content from disk
    try {
        const filePath = path.join(DEV_WORKSPACE_DIR, file.name);
        const content = await fs.readFile(filePath, 'utf-8');
        return { ...file, content };
    } catch {
        return file;
    }
}

export async function updateLocalFile(id: string, content: string): Promise<boolean> {
    const file = inMemoryFiles.get(id);
    if (!file) return false;

    // Update in memory
    file.content = content;
    file.updatedAt = new Date();
    inMemoryFiles.set(id, file);

    // Write to disk
    try {
        const filePath = path.join(DEV_WORKSPACE_DIR, file.name);
        await fs.writeFile(filePath, content, 'utf-8');
        console.log(`💾 [Local Dev] Saved file: ${file.name}`);
        return true;
    } catch (e) {
        console.error(`[Local Dev] Failed to save ${file.name}:`, e);
        return false;
    }
}

export async function deleteLocalFile(id: string): Promise<boolean> {
    const file = inMemoryFiles.get(id);
    if (!file) return false;

    // Remove from memory
    inMemoryFiles.delete(id);

    // Remove from disk
    try {
        const filePath = path.join(DEV_WORKSPACE_DIR, file.name);
        await fs.unlink(filePath);
        console.log(`🗑️ [Local Dev] Deleted file: ${file.name}`);
        return true;
    } catch {
        return true; // File might not exist on disk
    }
}

export async function listLocalFiles(): Promise<Array<{
    id: string;
    name: string;
    language: string;
    createdAt: Date;
    updatedAt: Date;
}>> {
    return Array.from(inMemoryFiles.values()).map(f => ({
        id: f.id,
        name: f.name,
        language: f.language,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
    }));
}

export function isLocalFileId(id: string): boolean {
    return id.startsWith('local-');
}
