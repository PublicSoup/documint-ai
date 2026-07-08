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

const UNREACHABLE_HINT =
    "Make sure the local server is running, the address/port is correct, and CORS is enabled " +
    "(LM Studio: Developer tab → Local Server → enable “Serve on Local Network”/CORS. " +
    "Ollama: start it with OLLAMA_ORIGINS=* set).";

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
 * Build a reachability error tuned to the most likely cause. The failure mode
 * that trips people up most is a *deployed HTTPS* page trying to reach a plain
 * `http://localhost` server: Chrome's Private Network Access protection blocks
 * that even when the server is up and CORS is on, and it surfaces as a generic
 * fetch failure. Call that out explicitly instead of blaming the server.
 */
function unreachableMessage(baseUrl: string): string {
    const onHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const targetIsHttp = baseUrl.startsWith("http://");
    const missingVersionPath = !/\/v\d+$/.test(new URL(baseUrl).pathname.replace(/\/$/, "") || "") &&
        !baseUrl.includes("/v1");

    const parts = [`Could not reach ${baseUrl}.`];

    if (onHttps && targetIsHttp && isLoopbackOrPrivate(baseUrl)) {
        parts.push(
            "You're on the hosted (HTTPS) site, and browsers block an HTTPS page from calling a local " +
            "http://localhost server — even with CORS on. Either run DocuMint locally over http://localhost, " +
            "or expose your model server over HTTPS (e.g. an ngrok/Cloudflare tunnel) and use that URL.",
        );
    } else if (missingVersionPath) {
        parts.push(`The URL usually needs to end in /v1 (e.g. ${baseUrl}/v1). ${UNREACHABLE_HINT}`);
    } else {
        parts.push(UNREACHABLE_HINT);
    }

    return parts.join(" ");
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
        const res = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(6000) });
        if (!res.ok) {
            return { ok: false, models: [], error: `Server responded with HTTP ${res.status}.` };
        }
        const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null;
        const models = (data?.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
        return { ok: true, models };
    } catch (e) {
        if (e instanceof DOMException && e.name === "TimeoutError") {
            return { ok: false, models: [], error: `Timed out reaching ${baseUrl}. ${UNREACHABLE_HINT}` };
        }
        return { ok: false, models: [], error: unreachableMessage(baseUrl) };
    }
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
        response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: config.modelId || "local-model",
                messages,
                stream: true,
                temperature: options.temperature ?? 0.4,
            }),
            signal: options.signal,
        });
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
