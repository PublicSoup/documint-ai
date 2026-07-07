import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazily construct the client so importing this module never throws at build /
// module-load time when the Supabase env vars aren't present. createClient()
// with an empty URL throws "supabaseUrl is required", which previously crashed
// Next's page-data collection on any route that imports this file.
let cachedClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
    if (cachedClient) return cachedClient;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error(
            'Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
        );
    }

    cachedClient = createClient(supabaseUrl, supabaseServiceKey);
    return cachedClient;
}

const BUCKET_NAME = 'code-files';

export async function uploadFile(path: string, content: string): Promise<string | null> {
    const { data, error } = await getSupabase().storage
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
    const { data, error } = await getSupabase().storage
        .from(BUCKET_NAME)
        .download(path);

    if (error) {
        console.error('Error downloading from Supabase Storage:', error);
        return null;
    }

    return await data.text();
}

export async function deleteFile(path: string): Promise<boolean> {
    const { error } = await getSupabase().storage
        .from(BUCKET_NAME)
        .remove([path]);

    if (error) {
        console.error('Error deleting from Supabase Storage:', error);
        return false;
    }

    return true;
}
