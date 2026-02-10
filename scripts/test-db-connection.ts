import { PrismaClient } from '@prisma/client';

const databaseUrl = "postgresql://postgres.bnafgbylmsukdkzccovo:DocumintPRO_2026!@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1";

console.log("🔌 Testing Database Connection...");
console.log(`URL: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`); // Log masked URL

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

async function main() {
  try {
    await prisma.$connect();
    console.log("✅ Successfully connected to the database!");

    // Try a simple query
    const userCount = await prisma.user.count();
    console.log(`📊 User count: ${userCount}`);

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();