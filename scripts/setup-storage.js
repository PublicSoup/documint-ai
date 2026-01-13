const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setup() {
    try {
        console.log('Checking storage buckets...');
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();

        if (listError) {
            throw new Error(`Error listing buckets: ${listError.message}`);
        }

        const bucketName = 'code-files';
        const exists = buckets.find(b => b.name === bucketName);

        if (!exists) {
            console.log(`Bucket "${bucketName}" not found. Creating...`);
            const { data, error } = await supabase.storage.createBucket(bucketName, {
                public: true,
                fileSizeLimit: 10485760, // 10MB
            });

            if (error) {
                throw new Error(`Error creating bucket: ${error.message}`);
            }
            console.log(`Bucket "${bucketName}" created successfully!`);
        } else {
            console.log(`Bucket "${bucketName}" already exists.`);
        }
    } catch (error) {
        console.error('Setup failed:', error.message);
        process.exit(1);
    }
}

setup();
