import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { env } from '../lib/env';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const supabase = createClient(
    env.SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrate() {
    console.log('Fetching files from database...');
    const files = await prisma.file.findMany({
        where: {
            storagePath: null,
            content: { not: null }
        }
    });

    console.log(`Found ${files.length} files to migrate.`);

    for (const file of files) {
        if (!file.content) continue;

        const storagePath = `${file.userId || 'system'}/${file.id}-${file.name}`;

        console.log(`Migrating ${file.name}...`);

        const { error } = await supabase.storage
            .from('code-files')
            .upload(storagePath, file.content, {
                upsert: true,
                contentType: 'text/plain'
            });

        if (error) {
            console.error(`Failed to upload ${file.name}:`, error.message);
            continue;
        }

        await prisma.file.update({
            where: { id: file.id },
            data: {
                storagePath,
                content: null // Optional: Clear content field to save DB space
            }
        });

        console.log(`Successfully migrated ${file.name}`);
    }

    console.log('Migration complete.');
}

migrate()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
