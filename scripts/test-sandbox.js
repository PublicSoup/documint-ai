const { runInSandbox } = require("../src/lib/sandbox");

// Note: If the file is ESM, we might need to use dynamic import()
// but since I'm running this with node-temp which I set up, 
// and the project seems to be a mix, I'll try dynamic import if require fails.

async function test() {
    console.log("Testing Vercel Sandbox Robustness (JS)...");

    let run;
    try {
        // Try to get the function, handling both ESM and CJS if possible
        const mod = await import("../src/lib/sandbox.js").catch(() => null);
        run = mod ? mod.runInSandbox : require("../src/lib/sandbox").runInSandbox;
    } catch (e) {
        console.error("Failed to import runInSandbox:", e.message);
        return;
    }

    if (!run) {
        console.error("runInSandbox function not found in module.");
        return;
    }

    // Test 1: Simple command
    console.log("\n[Test 1] Simple echo command:");
    try {
        const res1 = await run("echo", ["Hello from Vercel Sandbox!"]);
        console.log(JSON.stringify(res1, null, 2));
    } catch (e) {
        console.log("Test 1 Failed as expected or errored:", e.message);
    }

    // Test 3: Short timeout
    console.log("\n[Test 3] Short timeout (should fail):");
    try {
        const res3 = await run("sleep", ["10"], 1000);
        console.log(JSON.stringify(res3, null, 2));
    } catch (e) {
        console.log("Test 3 Failed as expected or errored:", e.message);
    }
}

test().catch(console.error);
