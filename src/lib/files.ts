import { db } from './db';
import { downloadFile } from './supabase/storage';
import path from 'path';
import { promises as fs } from 'fs';
import { WebContainerManager } from './web-container';
import type { File } from '@prisma/client';

export async function getFileContent(fileId: string): Promise<string | null> {
    const file = await db.file.findUnique({
        where: { id: fileId },
        select: { content: true, storagePath: true }
    });

    if (!file) return null;

    if (file.content) return file.content;

    if (file.storagePath) {
        return await downloadFile(file.storagePath);
    }

    return null;
}

/**
 * @deprecated This function is inefficient and insecure. Use syncUserWorkspaceToWebContainer instead.
 * Creates a temporary workspace for a user by copying relevant project files.
 * @param userId The ID of the user.
 * @param baseProjectRoot The root directory of the DocuMint AI application.
 * @returns The path to the temporary user workspace.
 */
export async function materializeUserWorkspace(userId: string, baseProjectRoot: string): Promise<string> {
    const tempDir = path.join(process.cwd(), '.temp', userId, Date.now().toString());
    try {
        await fs.mkdir(tempDir, { recursive: true });
    } catch (error: any) {
        console.error(`Failed to create directory ${tempDir}: ${error.message}`);
        throw error;
    }

    const gitSource = path.join(baseProjectRoot, '.git');
    const gitDest = path.join(tempDir, '.git');
    
    try {
        await fs.cp(gitSource, gitDest, { recursive: true, force: true });
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
            console.warn(`Could not copy .git directory: ${error.message}`);
        }
    }

    return tempDir;
}

/**
 * @deprecated This function is related to the insecure materializeUserWorkspace.
 * Cleans up the temporary user workspace.
 * @param workspacePath The path to the temporary user workspace.
 */
export async function cleanupUserWorkspace(workspacePath: string): Promise<void> {
    try {
        await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error: any) {
        console.error(`Failed to clean up user workspace at ${workspacePath}: ${error.message}`);
    }
}

const activeUserWorkspaces = new Set<string>();

/**
 * Initializes a git repository in the user's workspace within the WebContainer if one doesn't already exist.
 * @param userWorkspacePath The user-specific path within the WebContainer (e.g., /workspaces/userId).
 */
async function initializeGitInWorkspace(userWorkspacePath: string): Promise<void> {
    try {
        // Check if .git directory exists
        await WebContainerManager.readFile(path.join(userWorkspacePath, '.git', 'config'));
    } catch (error) {
        // If readFile throws, .git likely doesn't exist. Initialize the repository.
        const initProcess = await WebContainerManager.spawn('git', {
            args: ['init'],
            cwd: userWorkspacePath,
        });
        const exitCode = await initProcess.exit;
        if (exitCode !== 0) {
            throw new Error('Failed to initialize git repository in WebContainer workspace.');
        }
    }
}

/**
 * Synchronizes a user's file workspace from the database to a dedicated directory
 * within the WebContainer's virtual file system.
 * @param userId The ID of the user.
 * @returns The path to the user's workspace within the WebContainer.
 */
export async function syncUserWorkspaceToWebContainer(userId: string): Promise<string> {
    const userWorkspacePath = path.join('/workspaces', userId);

    // Avoid re-syncing if already active in this session
    if (activeUserWorkspaces.has(userId)) {
        return userWorkspacePath;
    }

    const files = await db.file.findMany({
        where: {
            OR: [
                { userId: userId },
                { team: { members: { some: { userId } } } },
            ],
        },
    });

    const wcInstance = await WebContainerManager.getInstance();

    // Ensure the base directory exists
    await wcInstance.fs.mkdir(userWorkspacePath, { recursive: true });

    for (const file of files) {
        const filePath = path.join(userWorkspacePath, file.name);
        const dirName = path.dirname(filePath);

        // Ensure the directory for the file exists
        await wcInstance.fs.mkdir(dirName, { recursive: true });

        // Use the manager to handle write operations with recovery
        await WebContainerManager.writeFile(filePath, file.content || '');
    }
    
    // Initialize git if it's not already there
    await initializeGitInWorkspace(userWorkspacePath);

    activeUserWorkspaces.add(userId);
    return userWorkspacePath;
}
