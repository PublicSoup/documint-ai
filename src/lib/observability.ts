/**
 * Centralized error reporting.
 *
 * The dashboard degrades to empty state when a data query fails (so a broken
 * panel never takes down the page). That resilience is good — but for a long
 * time it *also* meant real bugs (e.g. a query selecting a column that didn't
 * exist) were completely invisible: the `catch` swallowed them and the panel
 * just showed zeros. Every such degrade-to-empty path should call
 * `reportError` so the failure is loud in the server logs (and, once a sink is
 * registered, in an error tracker) even though the user still sees a graceful
 * fallback.
 *
 * This is intentionally dependency-free. To forward to Sentry/Datadog/etc.,
 * install the SDK and call `registerErrorSink` once at startup (e.g. in
 * `instrumentation.ts`); nothing else in the app needs to change.
 */

export interface ErrorContext {
    /** Where it happened, e.g. "dashboard.getProjectMonitoringData". Required. */
    where: string;
    /** True when the failure was handled by degrading to a fallback value. */
    degraded?: boolean;
    /** Any extra structured fields (userId, teamId, ids, …). */
    [key: string]: unknown;
}

type ErrorSink = (error: unknown, context: ErrorContext) => void;

let sink: ErrorSink | null = null;

/** Register a downstream sink (Sentry, Datadog, …). Called once at startup. */
export function registerErrorSink(fn: ErrorSink): void {
    sink = fn;
}

/**
 * Report an error. Never throws. Always emits a structured, greppable server
 * log line (`[reportError]`), then forwards to the registered sink if any.
 */
export function reportError(error: unknown, context: ErrorContext): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // Structured server log — surfaces in Vercel logs / log drains. The prefix
    // makes it trivial to alert on or grep for.
    console.error(`[reportError] ${context.where}: ${message}`, {
        ...context,
        stack,
        timestamp: new Date().toISOString(),
    });

    try {
        sink?.(error, context);
    } catch {
        // Reporting must never break the request.
    }
}
