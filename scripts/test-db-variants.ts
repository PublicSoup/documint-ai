import { PrismaClient } from '@prisma/client';

const PASSWORD = "racqi1-wiQvu";
const PROJECT_REF = "bnafgbylmsukdkzccovo";

// Variations to test
const configs = [
    {
        name: "Pooler (User: postgres.ref)",
        url: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
    },
    {
        name: "Direct (User: postgres.ref)",
        url: `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres`
    },
    {
        name: "Direct (User: postgres)",
        url: `postgresql://postgres:${PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres`
    },
    {
        name: "Suggested Password (Pooler)",
        url: `postgresql://postgres.${PROJECT_REF}:P@ssw0rd_Sup3r_S3cur3_DoNotShare_99!@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
    }
];

async function testConnection(name: string, url: string) {
    console.log(`\nTesting: ${name}`);
    console.log(`URL: ${url.replace(/:[^:@]+@/, ':***@')}`);

    const prisma = new PrismaClient({
        datasources: { db: { url } },
        log: ['error']
    });

    try {
        await prisma.$connect();
        const count = await prisma.user.count();
        console.log(`✅ SUCCESS! Connected. User count: ${count}`);
        await prisma.$disconnect();
        return true;
    } catch (e: any) {
        console.log(`❌ Failed: ${e.message.split('\n').pop()}`);
        await prisma.$disconnect();
        return false;
    }
}

async function main() {
    console.log("🔍 Starting Robust Database Connection Test...");

    for (const config of configs) {
        if (await testConnection(config.name, config.url)) {
            process.exit(0);
        }
    }

    console.log("\n❌ ALL variations failed. The password is definitely incorrect.");
    process.exit(1);
}

main();
