import type { LocalSandbox } from "./local-sandbox";

/**
 * Process-wide registry of live in-container sandboxes.
 *
 * Two consumers need to find a running sandbox by id after `createSandbox()`
 * returned:
 *   - the preview proxy (`/api/preview/<sandboxId>/...`, added during
 *     integration) looks up a sandbox's dev-server port to stream to it;
 *   - a background reaper disposes sandboxes whose lifetime has elapsed, so a
 *     detached dev server can't leak the container's disk/ports forever.
 *
 * State is pinned on `globalThis` so it survives Next.js HMR / module
 * re-evaluation in dev (same pattern as src/lib/web-container.ts).
 */

interface RegistryState {
    sandboxes: Map<string, LocalSandbox>;
    reaper: ReturnType<typeof setInterval> | null;
}

const REGISTRY_KEY = "__documint_executor_registry";
const REAP_INTERVAL_MS = 30_000;

function state(): RegistryState {
    const globalObject = globalThis as Record<string, unknown>;
    if (!globalObject[REGISTRY_KEY]) {
        globalObject[REGISTRY_KEY] = { sandboxes: new Map<string, LocalSandbox>(), reaper: null } satisfies RegistryState;
    }
    return globalObject[REGISTRY_KEY] as RegistryState;
}

export function registerSandbox(sandbox: LocalSandbox): void {
    state().sandboxes.set(sandbox.sandboxId, sandbox);
    ensureReaper();
}

export function getSandbox(sandboxId: string): LocalSandbox | undefined {
    return state().sandboxes.get(sandboxId);
}

export function unregisterSandbox(sandboxId: string): void {
    state().sandboxes.delete(sandboxId);
}

export function listSandboxes(): LocalSandbox[] {
    return [...state().sandboxes.values()];
}

/** Start the reaper once. It disposes expired sandboxes and never keeps the event loop alive. */
function ensureReaper(): void {
    const registry = state();
    if (registry.reaper) return;

    registry.reaper = setInterval(() => {
        const now = Date.now();
        for (const sandbox of [...registry.sandboxes.values()]) {
            if (sandbox.isExpired(now)) {
                void sandbox.stop().catch(() => undefined);
            }
        }
    }, REAP_INTERVAL_MS);

    // A background timer must never hold the process open on its own.
    registry.reaper.unref?.();
}
