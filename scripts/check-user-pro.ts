import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@documint.ai"; // Or whatever user we want to check
  const user = await prisma.user.findUnique({
    where: { email },
    include: { subscription: true }
  });

  if (!user) {
    console.log("User not found");
    return;
  }

  console.log("User:", user.email);
  console.log("Subscription:", user.subscription);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });