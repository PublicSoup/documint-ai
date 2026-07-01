/**
 * Idempotently ensure the AI-usage / BYO-API-key schema exists in the database.
 *
 * The migration `20260509134000_add_ai_usage_and_api_key` adds `User.encrypted_api_key`
 * and the `AiUsage` table, but the build only runs `prisma generate` (never
 * `migrate deploy`), so on databases created before that migration these are
 * missing — every AI call then crashes with
 * `column User.encrypted_api_key does not exist`.
 *
 * This runs during the build. Every statement is `IF NOT EXISTS` and wrapped in
 * its own try/catch, and the script always exits 0, so it can never break a
 * deploy — it just brings an out-of-date database up to date.
 */

if (!process.env.DATABASE_URL) {
  console.log("[ensure-ai-schema] No DATABASE_URL; skipping.");
  process.exit(0);
}

const statements = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "encrypted_api_key" TEXT`,
  `CREATE TABLE IF NOT EXISTS "AiUsage" (
     "id" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "month" TIMESTAMP(3) NOT NULL,
     "queryCount" INTEGER NOT NULL DEFAULT 0,
     "tokenCount" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "AiUsage_userId_month_idx" ON "AiUsage"("userId", "month")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AiUsage_userId_month_key" ON "AiUsage"("userId", "month")`,
];

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    for (const sql of statements) {
      try {
        await prisma.$executeRawUnsafe(sql);
        console.log("[ensure-ai-schema] ok:", sql.split("\n")[0].trim().slice(0, 60));
      } catch (e) {
        console.warn("[ensure-ai-schema] skip:", sql.split("\n")[0].trim().slice(0, 60), "-", e?.message);
      }
    }
    // Foreign key added separately: no "IF NOT EXISTS" for constraints, so
    // rely on the duplicate error being harmless.
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
    } catch {
      /* constraint already exists — fine */
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => console.warn("[ensure-ai-schema] skipped:", e?.message))
  .finally(() => process.exit(0));
