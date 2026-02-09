import { createClient } from "@supabase/supabase-js";
import { env } from "../env";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Virtual File System (VFS) for AI Agents
 * 
 * Provides a unified view of the file system by merging:
 * 1. Read-Only Local File System (Project Source)
 * 2. Read/Write Remote File System (Supabase Storage)
 * 
 * This allows the Agent to "edit" files in a serverless environment
 * by storing the modified versions in Supabase.
 */

// Initialize Supabase Client with Service Role (Admin) access
// This is required to manage user workspaces secureley
const supabase = (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const BUCKET_NAME = "user_workspaces";

// Helper: Ensure bucket exists (best effort)
let bucketChecked = false;
async function ensureBucket() {
    if (!supabase || bucketChecked) return;
    try {
        const { data, error } = await supabase.storage.getBucket(BUCKET_NAME);
        if (error) {
            if (error.message.includes("not found")) {
                console.log(`VFS: Creating bucket ${BUCKET_NAME}`);
                await supabase.storage.createBucket(BUCKET_NAME, {
                    public: false,
                    fileSizeLimit: 10485760, // 10MB
                });
            } else {
                throw error;
            }
        }
        bucketChecked = true;
    } catch (e) {
        console.error("VFS: Critical bucket initialization error:", e);
    }
}

/**
 * Normalizes paths for VFS and prevents traversal.
 */
function normalizeVfsPath(filePath: string): string {
    return path.posix.join('/', filePath).substring(1);
}

/**
 * Write a file to the user's workspace (Supabase)
 */
export async function writeFile(userId: string, filePath: string, content: string): Promise<boolean> {
    if (!supabase) return false;
    await ensureBucket();

    // Clean path to avoid traversal
    const storagePath = `${userId}/${normalizeVfsPath(filePath)}`;

    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, content, {
            upsert: true,
            contentType: 'text/plain'
        });

    if (error) {
        console.error(`VFS Write Error [${storagePath}]:`, error);
        return false;
    }
    return true;
}

/**
 * Read a file (try Supabase first, then Local)
 */
export async function readFile(userId: string, filePath: string, cwd: string): Promise<string> {
    const storagePath = `${userId}/${normalizeVfsPath(filePath)}`;

    // 1. Try Supabase (User's modified version)
    if (supabase) {
        await ensureBucket();
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(storagePath);

        if (!error && data) {
            return await data.text();
        }
    }

    // 2. Fallback to Local FS (Original project file)
    // Prevent reading outside of project
    const localPath = path.resolve(cwd, filePath);
    if (!localPath.startsWith(cwd)) {
        throw new Error("Access denied: Cannot read outside of project root");
    }

    return await fs.readFile(localPath, 'utf-8');
}

/**
 * List files (Merge Local + Supabase)
 */
export async function listFiles(userId: string, dirPath: string, cwd: string): Promise<string[]> {
    const cleanDir = normalizeVfsPath(dirPath);
    const uniqueFiles = new Set<string>();

    // 1. List Local Files
    const localDir = path.resolve(cwd, dirPath);
    if (localDir.startsWith(cwd)) {
        try {
            const entries = await fs.readdir(localDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.next') continue;
                uniqueFiles.add(entry.name);
            }
        } catch (e) {
            // Ignore missing local dirs (might exist only in Supabase)
        }
    }

    // 2. List Supabase Files
    if (supabase) {
        await ensureBucket();
        // Supabase list is recursive-ish, need to filter for current dir
        // Path matches: userId/dirPath/*
        const prefix = dirPath === '.' ? `${userId}/` : `${userId}/${cleanDir}/`;

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list(prefix.replace(/\/$/, ''), {
                limit: 100
            });

        if (!error && data) {
            for (const file of data) {
                uniqueFiles.add(file.name);
            }
        }
    }

    return Array.from(uniqueFiles).sort();
}

/**
 * Delete a file (Only from Supabase)
 * We cannot delete local read-only files, but we can potentially "hide" them in a future version.
 * For now, delete only affects user edits.
 */
export async function deleteFile(userId: string, filePath: string): Promise<boolean> {
    if (!supabase) return false;
    await ensureBucket();

    const storagePath = `${userId}/${normalizeVfsPath(filePath)}`;

    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);

    return !error;
}
