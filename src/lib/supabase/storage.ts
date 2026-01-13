import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_NAME = 'code-files';

export async function uploadFile(path: string, content: string): Promise<string | null> {
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, content, {
            upsert: true,
            contentType: 'text/plain',
        });

    if (error) {
        console.error('Error uploading to Supabase Storage:', error);
        return null;
    }

    return data.path;
}

export async function downloadFile(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(path);

    if (error) {
        console.error('Error downloading from Supabase Storage:', error);
        return null;
    }

    return await data.text();
}

export async function deleteFile(path: string): Promise<boolean> {
    const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([path]);

    if (error) {
        console.error('Error deleting from Supabase Storage:', error);
        return false;
    }

    return true;
}
