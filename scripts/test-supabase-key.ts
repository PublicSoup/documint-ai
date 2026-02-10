import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://bnafgbylmsukdkzccovo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuYWZnYnlsbXN1a2RremNjb3ZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODI2MjkzMiwiZXhwIjoyMDgzODM4OTMyfQ.YJ-A_BmKwsCZHbZQyEABONqr7AfUXTWDX8fivNjxhh4";

console.log("🔌 Testing Supabase Service Role Key...");
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    try {
        // Try to list buckets (requires admin/service role usually)
        const { data, error } = await supabase.storage.listBuckets();

        if (error) {
            console.error("❌ Supabase Key Failed:", error.message);
            process.exit(1);
        }

        console.log("✅ Supabase Service Role Key is VALID!");
        console.log(`📦 Buckets found: ${data?.length || 0}`);
        process.exit(0);

    } catch (error: any) {
        console.error("❌ Unexpected error:", error.message);
        process.exit(1);
    }
}

main();
