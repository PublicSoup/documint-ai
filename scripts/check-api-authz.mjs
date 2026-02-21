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
  "/api/auth/reset-password/",
  "/api/v1/",
  "/api/invites/[token]/",
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
  const hasMutatingHandler = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.test(src);
  if (!hasMutatingHandler) continue;

  const hasServerSessionImport = src.includes("getServerSession");
  const hasValidateAdmin = src.includes("validateAdmin(");
  const hasUnauthorizedGuard = /Unauthorized/.test(src) && /401/.test(src);
  const hasForbiddenGuard = /Forbidden/.test(src) && /403/.test(src);

  const pass = (hasServerSessionImport && hasUnauthorizedGuard) || hasValidateAdmin || hasForbiddenGuard;

  if (!pass) {
    findings.push({ file: rel, hasServerSessionImport, hasValidateAdmin, hasUnauthorizedGuard, hasForbiddenGuard });
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
