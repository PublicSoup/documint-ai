import { db } from './db';
import { downloadFile } from './supabase/storage';

export async function getFileContent(fileId: string): Promise<string | null> {
    const file = await db.file.findUnique({
        where: { id: fileId },
        select: { content: true, storagePath: true }
    }) as any;

    if (!file) return null;

    if (file.content) return file.content;

    if (file.storagePath) {
        return await downloadFile(file.storagePath);
    }

    return null;
}
