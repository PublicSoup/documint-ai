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

// Prefer the direct (non-pooled) connection for DDL — pooled/pgBouncer URLs can
// reject schema changes. Fall back to DATABASE_URL if DIRECT_URL isn't set.
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.log("[ensure-ai-schema] No DIRECT_URL/DATABASE_URL; skipping.");
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

  // --- Auto Code Reviewer (Enterprise) ---
  `CREATE TABLE IF NOT EXISTS "ReviewPolicy" (
     "id" TEXT NOT NULL,
     "repoFullName" TEXT NOT NULL,
     "ownerUserId" TEXT NOT NULL,
     "teamId" TEXT,
     "enabled" BOOLEAN NOT NULL DEFAULT true,
     "autoReview" BOOLEAN NOT NULL DEFAULT true,
     "postComments" BOOLEAN NOT NULL DEFAULT true,
     "postStatus" BOOLEAN NOT NULL DEFAULT true,
     "blockingSeverity" TEXT NOT NULL DEFAULT 'high',
     "checks" JSONB,
     "ignorePaths" JSONB,
     "instructions" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "ReviewPolicy_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReviewPolicy_repoFullName_key" ON "ReviewPolicy"("repoFullName")`,
  `CREATE INDEX IF NOT EXISTS "ReviewPolicy_teamId_idx" ON "ReviewPolicy"("teamId")`,
  `CREATE INDEX IF NOT EXISTS "ReviewPolicy_ownerUserId_idx" ON "ReviewPolicy"("ownerUserId")`,

  `CREATE TABLE IF NOT EXISTS "CodeReview" (
     "id" TEXT NOT NULL,
     "kind" TEXT NOT NULL DEFAULT 'FILE',
     "title" TEXT,
     "fileId" TEXT,
     "repoFullName" TEXT,
     "prNumber" INTEGER,
     "headSha" TEXT,
     "status" TEXT NOT NULL DEFAULT 'QUEUED',
     "verdict" TEXT,
     "summary" TEXT,
     "qualityScore" INTEGER NOT NULL DEFAULT 0,
     "grade" TEXT,
     "impactScore" INTEGER NOT NULL DEFAULT 0,
     "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
     "strengths" JSONB,
     "findings" JSONB,
     "blocking" BOOLEAN NOT NULL DEFAULT false,
     "source" TEXT NOT NULL DEFAULT 'MANUAL',
     "model" TEXT,
     "error" TEXT,
     "userId" TEXT,
     "teamId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "CodeReview_pkey" PRIMARY KEY ("id")
   )`,
  // Columns added after the table may already exist on earlier deploys — additive & idempotent.
  `ALTER TABLE "CodeReview" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'FILE'`,
  `ALTER TABLE "CodeReview" ADD COLUMN IF NOT EXISTS "title" TEXT`,
  `ALTER TABLE "CodeReview" ADD COLUMN IF NOT EXISTS "fileId" TEXT`,
  `ALTER TABLE "CodeReview" ADD COLUMN IF NOT EXISTS "qualityScore" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "CodeReview" ADD COLUMN IF NOT EXISTS "grade" TEXT`,
  `ALTER TABLE "CodeReview" ADD COLUMN IF NOT EXISTS "strengths" JSONB`,
  `ALTER TABLE "CodeReview" ALTER COLUMN "repoFullName" DROP NOT NULL`,
  `ALTER TABLE "CodeReview" ALTER COLUMN "prNumber" DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "CodeReview_repoFullName_prNumber_idx" ON "CodeReview"("repoFullName", "prNumber")`,
  `CREATE INDEX IF NOT EXISTS "CodeReview_fileId_idx" ON "CodeReview"("fileId")`,
  `CREATE INDEX IF NOT EXISTS "CodeReview_userId_idx" ON "CodeReview"("userId")`,
  `CREATE INDEX IF NOT EXISTS "CodeReview_teamId_idx" ON "CodeReview"("teamId")`,
  `CREATE INDEX IF NOT EXISTS "CodeReview_createdAt_idx" ON "CodeReview"("createdAt")`,

  // --- IDE chat sessions (persistent AI agent conversations) ---
  `CREATE TABLE IF NOT EXISTS "ChatSession" (
     "id" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "title" TEXT NOT NULL DEFAULT 'New chat',
     "model" TEXT,
     "messages" JSONB,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "ChatSession_userId_updatedAt_idx" ON "ChatSession"("userId", "updatedAt")`,
];

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
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
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ReviewPolicy" ADD CONSTRAINT "ReviewPolicy_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
    } catch {
      /* constraint already exists — fine */
    }
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "CodeReview" ADD CONSTRAINT "CodeReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      );
    } catch {
      /* constraint already exists — fine */
    }
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "CodeReview" ADD CONSTRAINT "CodeReview_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      );
    } catch {
      /* constraint already exists — fine */
    }
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
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
