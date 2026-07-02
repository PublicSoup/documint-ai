import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    rules: {
      // Surfaced as warnings while the codebase is typed incrementally;
      // API routes are held to a hard no-any standard by scripts/check-api-no-any.mjs.
      "@typescript-eslint/no-explicit-any": "warn",
      // Literal apostrophes/quotes in JSX copy are fine; escaping them hurts readability.
      "react/no-unescaped-entities": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deployment/build artifacts (must never be linted as source):
    ".vercel/**",
    "coverage/**",
    "dist/**",
    "node-temp/**",
    "vibe-coding-platform-main/**",
  ]),
]);

export default eslintConfig;
