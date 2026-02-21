#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "src", "app", "api");
const BASELINE_PATH = path.join(ROOT, ".ci", "api-no-any-baseline.txt");
const WRITE_BASELINE = process.argv.includes("--write-baseline");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (ent.isFile() && ent.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = walk(API_DIR);
const violations = [];

for (const file of files) {
  const rel = file.replace(ROOT + path.sep, "").replaceAll(path.sep, "/");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, idx) => {
    if (/\bany\b/.test(line)) {
      const likelyTypeUse = /:\s*any\b|as\s+any\b|<any>|Record<[^>]*any/.test(line);
      if (likelyTypeUse) {
        violations.push(`${rel}:${idx + 1}`);
      }
    }
  });
}

violations.sort();

if (WRITE_BASELINE) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${violations.join("\n")}\n`);
  console.log(`✅ Wrote baseline (${violations.length} entries): ${BASELINE_PATH}`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH)
  ? new Set(fs.readFileSync(BASELINE_PATH, "utf8").split("\n").map((l) => l.trim()).filter(Boolean))
  : new Set();

const newViolations = violations.filter((v) => !baseline.has(v));
const resolvedCount = [...baseline].filter((b) => !violations.includes(b)).length;

if (newViolations.length) {
  console.error("❌ New API explicit any usages introduced:\n");
  newViolations.forEach((v) => console.error(v));
  process.exit(1);
}

console.log(`✅ API no-any check passed. baseline=${baseline.size}, current=${violations.length}, resolved=${resolvedCount}`);
