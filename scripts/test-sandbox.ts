import { runInSandbox } from "../src/lib/sandbox";

async function test() {
    console.log("Testing Vercel Sandbox Robustness...");

    // Test 1: Simple command
    console.log("\n[Test 1] Simple echo command:");
    const res1 = await runInSandbox("echo", ["Hello from Vercel Sandbox!"]);
    console.log(JSON.stringify(res1, null, 2));

    // Test 2: Invalid command
    console.log("\n[Test 2] Invalid command:");
    const res2 = await runInSandbox("non_existent_command");
    console.log(JSON.stringify(res2, null, 2));

    // Test 3: Short timeout
    console.log("\n[Test 3] Short timeout (should fail):");
    const res3 = await runInSandbox("sleep", ["10"], 1000);
    console.log(JSON.stringify(res3, null, 2));
}

test().catch(console.error);
