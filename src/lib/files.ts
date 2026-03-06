import { db } from './db';
import { downloadFile } from './supabase/storage';
import path from 'path';
import { promises as fs } from 'fs';

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
 * Creates a temporary workspace for a user by copying relevant project files.
 * In a real scenario, this would involve copying the user's actual project files.
 * For now, we'll simulate by creating a temp directory and copying the .git folder
 * to allow git commands to function.
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
        throw error; // Re-throw the error to stop execution
    }

    // Simulate copying .git for git operations
    const gitSource = path.join(baseProjectRoot, '.git');
    const gitDest = path.join(tempDir, '.git');
    
    try {
        await fs.cp(gitSource, gitDest, { recursive: true, force: true });
    } catch (error: any) {
        // If .git doesn't exist in baseProjectRoot, that's fine for this simulation.
        // It might be a fresh clone or a different setup.
        if (error.code !== 'ENOENT') {
            console.warn(`Could not copy .git directory: ${error.message}`);
        }
    }

    // In a real application, you would copy the user's actual project files here.
    // For this build fix, just ensuring a functional git environment.

    return tempDir;
}

/**
 * Cleans up the temporary user workspace.
 * @param workspacePath The path to the temporary user workspace.
 */
export async function cleanupUserWorkspace(workspacePath: string): Promise<void> {
    try {
        try {
        await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (error: any) {
        console.error(`Failed to clean up user workspace at ${workspacePath}: ${error.message}`);
        throw error; // Re-throw the error to stop execution
    }
    } catch (error: any) {
        console.error(`Failed to clean up user workspace at ${workspacePath}: ${error.message}`);
    }
}
