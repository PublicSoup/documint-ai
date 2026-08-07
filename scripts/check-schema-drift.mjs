/**
 * Build-time schema-drift guard.
 *
 * This project deploys on Vercel, which runs `prisma generate` but never
 * `prisma migrate deploy`, and the production database was created with
 * `prisma db push` (its migration history does not match the live schema). The
 * result has bitten us twice: `File.metadata` and `DocVersion` existed in
 * `schema.prisma` (so the generated client happily selected them) but were
 * missing from the database — every query that touched them threw at runtime,
 * and the dashboard's degrade-to-empty catches hid it.
 *
 * `scripts/ensure-ai-schema.mjs` auto-heals *known* gaps. This script catches
 * the *unknown* ones: it asks Prisma for the SQL needed to bring the live DB up
 * to `schema.prisma`. Any `CREATE TABLE` / `ADD COLUMN` in that diff means the
 * database is missing something the app's Prisma client expects — a runtime
 * crash waiting to happen.
 *
 * Runs after ensure-ai-schema in the build. Non-blocking by default (loud
 * warning) so it can't surprise-break a deploy on first rollout; set
 * `SCHEMA_DRIFT_ENFORCE=1` to turn drift into a hard build failure.
 */

import { execSync } from "node:child_process";

const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.log("[schema-drift] No DIRECT_URL/DATABASE_URL; skipping.");
  process.exit(0);
}

let diffSql = "";
try {
  diffSql = execSync(
    `npx prisma migrate diff --from-url "$DRIFT_DB_URL" --to-schema-datamodel prisma/schema.prisma --script`,
    {
      // Pass the URL via env so special chars in the password aren't re-parsed
      // by the shell.
      env: { ...process.env, DRIFT_DB_URL: DB_URL },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
} catch (error) {
  // Tooling/connectivity failure must never block a deploy.
  console.warn("[schema-drift] Could not compute diff (skipping):", error?.message);
  process.exit(0);
}

// The diff transforms DB -> schema. `CREATE TABLE` / `ADD COLUMN` therefore mean
// "the schema has something the database lacks" — the crash-causing direction.
// (`DROP` = the DB has an extra column the schema doesn't; harmless, ignored.)
const missing = diffSql
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /\bADD COLUMN\b|\bCREATE TABLE\b/i.test(l) && !/\bDROP\b/i.test(l));

if (missing.length === 0) {
  console.log("[schema-drift] OK — database has every table/column schema.prisma expects.");
  process.exit(0);
}

console.error("\n[schema-drift] ⚠️  DATABASE IS MISSING SCHEMA ELEMENTS THE APP EXPECTS:");
for (const line of missing) console.error("   " + line);
console.error(
  "\nPrisma validates queries against schema.prisma, so selecting these will throw at\n" +
    "runtime (and the dashboard will silently show empty/zero). Fix by adding matching\n" +
    "`... IF NOT EXISTS` statements to scripts/ensure-ai-schema.mjs (dual-apply).\n",
);

process.exit(process.env.SCHEMA_DRIFT_ENFORCE === "1" ? 1 : 0);
