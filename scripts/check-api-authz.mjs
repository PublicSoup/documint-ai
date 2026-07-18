#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "src", "app", "api");

const EXEMPT_PATH_PARTS = [
  "/api/webhooks/",
  "/api/health/",
  "/api/cron/",
  "/api/register/",
  "/api/auth/",
  "/api/mobile/auth/",
  "/api/invites/[token]/",
  "/api/teams/[teamId]/badge/",
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (ent.isFile() && ent.name === "route.ts") out.push(full);
  }
  return out;
}

const routes = walk(API_DIR);
const findings = [];

for (const file of routes) {
  const rel = file.replace(ROOT, "");
  if (EXEMPT_PATH_PARTS.some((p) => rel.includes(p))) continue;

  const src = fs.readFileSync(file, "utf8");
  // Check if any standard HTTP handler is exported
  const hasHandler = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/.test(src);
  const usesApiHandler = src.includes("createApiHandler(");

  if (!hasHandler && !usesApiHandler) continue;

  // Deprecated stubs that only return HTTP 410 and never touch the database
  // carry no data and need no auth guard — skip them.
  const isDeprecatedStub = /\b410\b/.test(src) && !src.includes("db.") && !src.includes("prisma");
  if (isDeprecatedStub) continue;

  const hasServerSessionImport = src.includes("getServerSession");
  const hasValidateAdmin = src.includes("validateAdmin(");
  const hasValidateApiKey = src.includes("validateApiKey(");
  const hasUnauthorizedGuard = (/Unauthorized/.test(src) && /401/.test(src)) || src.includes("ApiErrors.unauthorized(");
  const hasForbiddenGuard = (/Forbidden/.test(src) && /403/.test(src)) || src.includes("ApiErrors.forbidden(");

  // createApiHandler handles auth, rate-limiting, and 401/403 internally
  const pass = usesApiHandler || (hasServerSessionImport && hasUnauthorizedGuard) || hasValidateAdmin || hasForbiddenGuard || hasValidateApiKey;

  if (!pass) {
    findings.push({ file: rel, hasServerSessionImport, hasValidateAdmin, hasUnauthorizedGuard, hasForbiddenGuard, usesApiHandler });
  }
}

if (findings.length) {
  console.error("❌ API authz checks failed in mutating routes:\n");
  for (const f of findings) {
    console.error(`- ${f.file} | getServerSession:${f.hasServerSessionImport} validateAdmin:${f.hasValidateAdmin} unauthorized-401:${f.hasUnauthorizedGuard} forbidden-403:${f.hasForbiddenGuard}`);
  }
  process.exit(1);
}

console.log(`✅ API authz checks passed (${routes.length} routes scanned)`);
