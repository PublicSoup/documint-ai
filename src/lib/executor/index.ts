import { currentRuntime } from "../runtime";
import { LocalSandbox } from "./local-sandbox";
import type { Sandbox, SandboxCreateOptions, SandboxProviderName } from "./types";

/**
 * Executor module: the host-agnostic replacement for direct `@vercel/sandbox`
 * usage. Call `createSandbox()` and program against the {@link Sandbox}
 * interface; the concrete backend is chosen from `currentRuntime.sandboxProvider`
 * (`local` on Railway/self-hosted, `vercel` on Vercel, `none` to disable).
 *
 * Integration TODO (see plans/railway-migration.md WS-3/WS-4): point
 * agent-sandbox.ts, api/ide/sandbox/run/route.ts and lib/sandbox.ts here, and
 * add the `/api/preview/[sandboxId]/...` proxy that `LocalSandbox.domain()`
 * targets.
 */

export type {
    Sandbox,
    SandboxCreateOptions,
    SandboxProviderName,
    CommandHandle,
    RunCommandOptions,
    WriteFileInput,
    SandboxRuntimeName,
} from "./types";
export { LocalSandbox } from "./local-sandbox";
export { getSandbox, listSandboxes } from "./registry";

export function getSandboxProvider(): SandboxProviderName {
    return currentRuntime.sandboxProvider;
}

/** True when this host can run user/agent code at all. */
export function isSandboxEnabled(): boolean {
    return currentRuntime.sandboxProvider !== "none";
}

/**
 * Create a sandbox using the host's configured provider.
 *
 * Returns `null` when execution is disabled (`none`) or the provider module
 * can't be loaded, so callers degrade gracefully — the same contract the
 * existing `loadSandbox()` helpers have (return null → surface SANDBOX_UNAVAILABLE).
 */
export async function createSandbox(options?: SandboxCreateOptions): Promise<Sandbox | null> {
    const provider = currentRuntime.sandboxProvider;
    try {
        if (provider === "vercel") {
            const { createVercelSandbox } = await import("./vercel-sandbox");
            return await createVercelSandbox(options);
        }
        if (provider === "local") {
            return await LocalSandbox.create(options);
        }
        return null;
    } catch (error) {
        console.warn(`[executor] Failed to create sandbox via provider "${provider}":`, error);
        return null;
    }
}
