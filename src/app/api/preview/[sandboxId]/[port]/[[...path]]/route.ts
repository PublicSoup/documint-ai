import { NextRequest } from "next/server";
import { getSandbox } from "@/lib/executor";

/**
 * Preview proxy for the in-container executor.
 *
 * `LocalSandbox.domain(port)` hands the agent/IDE a public, same-origin URL of
 * the form `/api/preview/<sandboxId>/<port>/...`. This route forwards that to
 * the sandbox's dev server on loopback. The dev server is configured (Vite) with
 * this same sub-path as its `base`, so the FULL original path is forwarded
 * unchanged and asset URLs resolve.
 *
 * Security: `sandboxId` is an unguessable 122-bit token and the port must match
 * the sandbox's active preview port — together an SSRF guard that stops this
 * from proxying to arbitrary loopback ports. Previews are short-lived (reaped
 * with their sandbox).
 *
 * MVP limitations (see plans/railway-migration.md WS-4):
 *   - HTTP only — HMR/WebSocket upgrades are not proxied, so live hot-reload
 *     won't connect; a manual refresh picks up changes.
 *   - Because the full sub-path is forwarded, this works for servers that honour
 *     a base path set to that sub-path (Vite — agent-sandbox injects it). Dev
 *     servers / static file servers that serve at the domain root (Next dev,
 *     `python -m http.server`, `php -S`) are not fully supported yet; the proper
 *     fix is per-sandbox subdomains (wildcard host → sandbox), which is deferred.
 */

export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

async function handle(
    req: NextRequest,
    ctx: { params: Promise<{ sandboxId: string; port: string; path?: string[] }> },
): Promise<Response> {
    const { sandboxId, port } = await ctx.params;
    const portNumber = Number(port);

    const sandbox = getSandbox(sandboxId);
    if (!sandbox || !Number.isInteger(portNumber) || sandbox.previewPort !== portNumber) {
        return new Response("Preview not found or expired.", { status: 404 });
    }

    // Forward the full original path (the dev server's `base` includes this
    // sub-path) plus the query string, to loopback.
    const target = `http://127.0.0.1:${portNumber}${req.nextUrl.pathname}${req.nextUrl.search}`;

    const headers = new Headers(req.headers);
    for (const key of [...headers.keys()]) {
        if (HOP_BY_HOP.has(key.toLowerCase())) headers.delete(key);
    }
    // Present the loopback origin as Host so the dev server's own host check and
    // any absolute-URL generation stay internally consistent.
    headers.set("host", `127.0.0.1:${portNumber}`);

    const method = req.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

    let upstream: Response;
    try {
        upstream = await fetch(target, {
            method,
            headers,
            body,
            redirect: "manual",
            signal: AbortSignal.timeout(30_000),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(`Preview upstream error: ${message}`, { status: 502 });
    }

    const responseHeaders = new Headers(upstream.headers);
    for (const key of [...responseHeaders.keys()]) {
        if (HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.delete(key);
    }
    // Previews render inside the IDE iframe (same-origin), so drop any
    // frame-blocking / CSP the dev server set that would prevent embedding.
    responseHeaders.delete("x-frame-options");
    responseHeaders.delete("content-security-policy");

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
