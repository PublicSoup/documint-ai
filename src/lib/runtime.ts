/** Which backend runs user/agent code. See src/lib/executor. */
export type SandboxProvider = "vercel" | "local" | "none";

export interface RuntimeConfig {
  canExecuteCommands: boolean;
  canWriteLocalFiles: boolean;
  canUseSandbox: boolean;
  /**
   * The sandbox backend the executor module should use. Independent of the
   * legacy `canUseSandbox`/`canExecuteCommands` flags above, which still gate
   * the not-yet-migrated call sites; once those move to `createSandbox()` the
   * gating collapses onto this field.
   */
  sandboxProvider: SandboxProvider;
  runtimeName: string;
}

const isVercel = !!process.env.VERCEL;
const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

/**
 * Resolve the sandbox backend. Explicit `SANDBOX_PROVIDER` always wins;
 * otherwise `vercel` on Vercel, and the in-container `local` executor
 * everywhere else (Railway / self-hosted / local dev).
 */
function resolveSandboxProvider(): SandboxProvider {
  const explicit = process.env.SANDBOX_PROVIDER?.toLowerCase();
  if (explicit === "vercel" || explicit === "local" || explicit === "none") return explicit;
  if (isVercel) return "vercel";
  return "local";
}

const sandboxProvider = resolveSandboxProvider();

export const currentRuntime: RuntimeConfig = {
  // Direct in-process execFile stays dev-only. Production execution goes through
  // the sandbox (Vercel VM or the in-container executor), never raw child_process
  // in the app's own cwd/env.
  canExecuteCommands: process.env.NODE_ENV === 'development',
  canWriteLocalFiles: process.env.NODE_ENV !== 'production',
  // A sandbox backend is available in production wherever a provider is set —
  // Vercel (VM) or Railway/self-hosted (in-container executor).
  canUseSandbox: sandboxProvider !== 'none' && process.env.NODE_ENV === 'production',
  sandboxProvider,
  runtimeName: isVercel ? 'vercel' : isRailway ? 'railway' : 'node',
};
