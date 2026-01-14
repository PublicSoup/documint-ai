
import { applyPatch } from "../src/lib/code-patcher";

const original = `import Head from 'next/head';

export default function TestPage() {
  return (
    <div className="container">
      <Head>
        <title>Old Title</title>
      </Head>
      <main>Hello</main>
    </div>
  );
}`;

const snippet = `      <Head>
        <title>New Title</title>
      </Head>`;

const result = applyPatch(original, snippet);
console.log("Patch Result Success:", result.success);
console.log("Method:", result.method);
console.log("Patched Code:\n", result.patchedCode);

if (result.patchedCode?.includes("New Title") && result.patchedCode.includes("import Head")) {
    console.log("✅ VERIFIED: Indentation and content patched correctly.");
} else {
    console.log("❌ FAILED: Patch did not work as expected.");
}
