/**
 * Client-only bridge to a locally-running OpenAI-compatible model server
 * (LM Studio, Ollama, vLLM, llama.cpp server, ...).
 *
 * Every other AI provider in this app is called from the Next.js server
 * (see lib/ai.ts) — but a model the user is running on their own machine
 * is, by definition, not reachable from Vercel's servers. "localhost" means
 * something different to a serverless function than it does to the user's
 * browser. So this path is the one exception: the browser talks to
 * `http://localhost:PORT` directly, and the config never touches our
 * backend — it lives entirely in `localStorage`.
 *
 * This trades the full tool-using agent (file edits, codebase actions —
 * see lib/agent/engine.ts, which only runs server-side) for a plain,
 * single-turn chat completion the browser can drive on its own. Code blocks
 * in the reply are still extracted and "Apply to file" still works, since
 * that only needs the browser-side file content — it just isn't an
 * autonomous multi-step agent loop.
 */

const STORAGE_KEY = "documint_local_model_config";

export const DEFAULT_LOCAL_MODEL_BASE_URL = "http://localhost:1234/v1";

export interface LocalModelConfig {
    /** OpenAI-compatible base URL, e.g. "http://localhost:1234/v1". */
    baseUrl: string;
    /** Model id to request. Most local servers ignore this and serve whatever is loaded. */
    modelId: string;
    /** Optional — most local servers don't check this, but some setups add one. */
    apiKey: string;
}

export type LocalChatRole = "system" | "user" | "assistant";
export interface LocalChatMessage {
    role: LocalChatRole;
    content: string;
}

export function normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

export function getLocalModelConfig(): LocalModelConfig | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<LocalModelConfig>;
        if (typeof parsed.baseUrl !== "string" || !parsed.baseUrl.trim()) return null;
        return {
            baseUrl: normalizeBaseUrl(parsed.baseUrl),
            modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
            apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        };
    } catch {
        return null;
    }
}

export function hasLocalModelConfig(): boolean {
    return getLocalModelConfig() !== null;
}

export function saveLocalModelConfig(config: LocalModelConfig): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            baseUrl: normalizeBaseUrl(config.baseUrl),
            modelId: config.modelId.trim(),
            apiKey: config.apiKey.trim(),
        }),
    );
}

export function clearLocalModelConfig(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
}

function isLoopbackOrPrivate(baseUrl: string): boolean {
    try {
        const host = new URL(baseUrl).hostname;
        return (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host === "0.0.0.0" ||
            host === "::1" ||
            host.endsWith(".local") ||
            /^10\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        );
    } catch {
        return false;
    }
}

/**
 * Build a reachability error that walks the likely causes in order. In
 * practice the #1 cause is simply a wrong port (LM Studio defaults to 1234,
 * Ollama to 11434), then the CORS toggle (which in LM Studio is a separate
 * setting from "Serve on Local Network"). The hosted-HTTPS-page → local
 * http:// server restriction comes last because it is usually NOT fatal:
 * browsers treat localhost as a trusted target, and Chrome asks for a
 * local-network permission rather than hard-blocking.
 */
function unreachableMessage(baseUrl: string): string {
    let pathname: string;
    try {
        pathname = new URL(baseUrl).pathname.replace(/\/$/, "");
    } catch {
        return `Could not reach ${baseUrl} — that doesn't look like a valid URL. Expected something like ${DEFAULT_LOCAL_MODEL_BASE_URL}.`;
    }

    const onHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const targetIsHttp = baseUrl.startsWith("http://");
    const missingVersionPath = !/\/v\d+$/.test(pathname);

    // A LAN IP (192.168.x, 10.x, ...) over http from an HTTPS page is mixed
    // content, which browsers block outright — and unlike localhost, a LAN IP
    // gets no exemption. This is the single most confusing case, because LM
    // Studio's "Serve on Local Network" advertises exactly that LAN-IP URL.
    if (onHttps && targetIsHttp && targetAddressSpaceFor(baseUrl) === "private") {
        let port = "1234";
        try { port = new URL(baseUrl).port || "1234"; } catch { /* keep default */ }
        return (
            `Could not reach ${baseUrl}. This is the hard case: you're on the HTTPS site and pointed it at a ` +
            `LAN IP over plain http, which browsers block as “mixed content” (a local ${"`"}localhost${"`"} address ` +
            `is exempt, but a 192.168.x / 10.x address is not). Fix: in LM Studio turn OFF “Serve on Local ` +
            `Network” so it binds to localhost, then use http://localhost:${port}/v1 here. If you need the LAN ` +
            `IP, you'll have to run DocuMint locally or put the server behind HTTPS.`
        );
    }

    const parts = [
        `Could not reach ${baseUrl}.`,
        "Double-check the address — LM Studio prints its server URL in the Developer tab " +
        `(default ${DEFAULT_LOCAL_MODEL_BASE_URL} — note the port), Ollama uses http://localhost:11434/v1` +
        (missingVersionPath ? ", and the path usually needs to end in /v1" : "") +
        ".",
        "Make sure CORS is on: in LM Studio that's the “Enable CORS” toggle (a separate setting from " +
        "“Serve on Local Network”); for Ollama set OLLAMA_ORIGINS=*.",
    ];

    if (onHttps && targetIsHttp && isLoopbackOrPrivate(baseUrl)) {
        parts.push(
            "If the address and CORS are both right, your browser may be stopping this HTTPS site from " +
            "calling a local http:// server — allow the local-network permission prompt if one appears. " +
            "If it's blocked outright, run DocuMint locally or expose the server via an HTTPS tunnel.",
        );
    }

    return parts.join(" ");
}

/** Which PNA address space a target belongs to, for Chrome's fetch hint. */
function targetAddressSpaceFor(baseUrl: string): "local" | "private" | null {
    try {
        const host = new URL(baseUrl).hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return "local";
        if (
            /^10\./.test(host) || /^192\.168\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local")
        ) {
            return "private";
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * fetch() with Chrome's `targetAddressSpace` hint attached when a hosted
 * HTTPS page is calling a plaintext-HTTP local/private server. The hint is
 * what makes the browser show a local-network permission prompt instead of
 * silently blocking the request. Browsers that don't know the option ignore
 * it; if the call still rejects we retry once without the hint so an
 * unsupported enum value can never be the reason a request fails.
 */
async function localFetch(url: string, init: RequestInit, baseUrl: string): Promise<Response> {
    const onHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const space = onHttps && baseUrl.startsWith("http://") ? targetAddressSpaceFor(baseUrl) : null;
    if (space) {
        try {
            return await fetch(url, { ...init, targetAddressSpace: space } as RequestInit);
        } catch (e) {
            if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) throw e;
            // Fall through and retry plain — covers browsers that reject the hint.
        }
    }
    return fetch(url, init);
}

export interface LocalModelTestResult {
    ok: boolean;
    models: string[];
    error?: string;
}

/**
 * Ping the server's `/models` endpoint (part of the OpenAI API surface every
 * one of these local servers implements) to confirm it's reachable and list
 * what's loaded.
 */
export async function testLocalModelConnection(config: LocalModelConfig): Promise<LocalModelTestResult> {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const headers: Record<string, string> = {};
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    try {
        const res = await localFetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(6000) }, baseUrl);
        if (!res.ok) {
            return { ok: false, models: [], error: `Server responded with HTTP ${res.status}.` };
        }
        const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
        const models = (data?.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
        return { ok: true, models };
    } catch {
        return { ok: false, models: [], error: unreachableMessage(baseUrl) };
    }
}

/** Addresses the popular local model servers listen on, most common first. */
const PROBE_CANDIDATE_URLS = [
    "http://localhost:1234/v1",  // LM Studio default
    "http://127.0.0.1:1234/v1",  // LM Studio, when localhost resolution misbehaves
    "http://localhost:11434/v1", // Ollama
    "http://localhost:8080/v1",  // llama.cpp server
];

export interface DetectedLocalServer {
    baseUrl: string;
    models: string[];
}

/**
 * Probe the well-known local model server ports and report any that answer
 * `/models`. Used by the settings UI after a failed connection test — the
 * most common failure is simply a wrong port, and this turns "could not
 * reach" into "…but there IS a server at :1234, use that?".
 */
export async function probeLocalModelServers(excludeBaseUrl?: string): Promise<DetectedLocalServer[]> {
    const exclude = excludeBaseUrl ? normalizeBaseUrl(excludeBaseUrl) : null;
    const candidates = PROBE_CANDIDATE_URLS.filter((url) => url !== exclude);

    const results = await Promise.all(candidates.map(async (baseUrl) => {
        try {
            const res = await localFetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(2500) }, baseUrl);
            if (!res.ok) return null;
            const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
            const models = (data?.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
            return { baseUrl, models };
        } catch {
            return null;
        }
    }));

    // localhost and 127.0.0.1 on the same port are the same server — keep the first hit per port.
    const seenPorts = new Set<string>();
    return results
        .filter((hit): hit is DetectedLocalServer => hit !== null)
        .filter((hit) => {
            const port = new URL(hit.baseUrl).port;
            if (seenPorts.has(port)) return false;
            seenPorts.add(port);
            return true;
        });
}

export interface StreamLocalChatOptions {
    signal?: AbortSignal;
    onDelta?: (delta: string) => void;
    temperature?: number;
}

interface ChatCompletionChunk {
    choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Stream a chat completion from the local server using the OpenAI
 * `chat/completions` SSE format every one of these servers speaks.
 * Returns the full accumulated text; `onDelta` fires per streamed token.
 */
export async function streamLocalChatCompletion(
    config: LocalModelConfig,
    messages: LocalChatMessage[],
    options: StreamLocalChatOptions = {},
): Promise<string> {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    let response: Response;
    try {
        response = await localFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: config.modelId || "local-model",
                messages,
                stream: true,
                temperature: options.temperature ?? 0.4,
            }),
            signal: options.signal,
        }, baseUrl);
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        throw new Error(unreachableMessage(baseUrl));
    }

    if (!response.ok || !response.body) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(
            `Local model server returned HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 300)}` : ""}`,
        );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
            for (const rawLine of rawEvent.split("\n")) {
                const line = rawLine.trim();
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;
                try {
                    const parsed = JSON.parse(payload) as ChatCompletionChunk;
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        full += delta;
                        options.onDelta?.(delta);
                    }
                } catch {
                    // Ignore partial/malformed SSE chunks — the next read fills them in.
                }
            }
        }
    }

    return full;
}
