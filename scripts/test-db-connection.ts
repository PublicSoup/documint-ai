import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("⏳ Testing database connection...");
  try {
    const userCount = await prisma.user.count();
    console.log(`✅ Database connection successful. User count: ${userCount}`);
    
    const subCount = await prisma.subscription.count();
    console.log(`✅ Subscription table accessible. Count: ${subCount}`);
  } catch (error: any) {
    console.error("❌ Database connection failed:");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
  } finally {
    await prisma.$disconnect();
  }
}

main();