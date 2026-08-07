/**
 * In-browser static site preview ("Tier 1").
 *
 * Assembles a workspace's static files into ONE self-contained HTML document by
 * inlining local stylesheets, scripts and SVGs. The result is rendered via the
 * preview iframe's `srcdoc`, which means:
 *
 *   - **No server compute.** No Vercel Sandbox VM, no billing per preview. This is
 *     the only static path available on mobile, where the in-browser WebContainer
 *     runtime cannot boot (iOS/Android WebViews don't grant SharedArrayBuffer).
 *   - **No WebContainer boot.** Previews appear instantly instead of after a
 *     multi-second runtime start, on desktop too.
 *   - **Safe by construction.** `srcdoc` content is rendered in a sandboxed iframe
 *     WITHOUT `allow-same-origin`, so the generated page gets an opaque origin and
 *     cannot read the app's cookies, storage, or DOM. See live-preview.tsx.
 *
 * Limits (callers fall back to the WebContainer static server on desktop): links
 * to other .html pages don't navigate, and relative `fetch()`/JS-module imports
 * don't resolve, because an opaque-origin document has no base URL to resolve
 * against. Single-page sites — what the AI generator emits — are unaffected.
 */

/** Anything with a scheme (`https:`, `data:`, …), protocol-relative, or a fragment. */
const EXTERNAL_REF_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function isExternalRef(ref: string): boolean {
    return ref.length === 0 || ref.startsWith("#") || EXTERNAL_REF_PATTERN.test(ref);
}

/** Collapse `.`/`..` segments; keeps paths comparable to workspace-relative names. */
export function normalizePreviewPath(path: string): string {
    const parts: string[] = [];

    for (const segment of path.split("/")) {
        if (!segment || segment === ".") continue;
        if (segment === "..") {
            parts.pop();
            continue;
        }
        parts.push(segment);
    }

    return parts.join("/");
}

/** Resolve an href/src found in `entryPath` to a workspace-relative file path. */
function resolveRef(entryPath: string, ref: string): string {
    const withoutQuery = ref.split("#")[0].split("?")[0];
    if (withoutQuery.startsWith("/")) return normalizePreviewPath(withoutQuery);

    const directory = entryPath.split("/").slice(0, -1).join("/");
    return normalizePreviewPath(directory ? `${directory}/${withoutQuery}` : withoutQuery);
}

/**
 * `</script>` inside inlined JS would terminate the surrounding tag and corrupt the
 * document. The standard escape stays valid JavaScript.
 */
function escapeScriptContent(content: string): string {
    return content.replace(/<\/script/gi, "<\\/script");
}

export interface StaticPreviewFile {
    name: string;
    content: string;
}

/**
 * Tier 2: wrap a bundled SPA (see src/lib/ide/spa-bundler.ts) in a host document.
 *
 * The bundle is inlined rather than fetched, because a `srcdoc` document inherits
 * the app's CSP and every external script/import/fetch is blocked by it. The
 * container element is taken from the project's own index.html when present so a
 * custom mount id (`#app` vs `#root`) still works.
 */
export function buildSpaPreviewDocument(params: {
    js: string;
    css?: string;
    /** The project's index.html, used to recover the mount element id. */
    html?: string;
}): string {
    const mountId =
        params.html?.match(/<div[^>]+id=["']([^"']+)["'][^>]*>\s*<\/div>/i)?.[1] ?? "root";
    const title = params.html?.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "Preview";

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${params.css ? `<style>${params.css}</style>` : ""}
</head>
<body>
<div id="${mountId}"></div>
<script>${escapeScriptContent(params.js)}</script>
</body>
</html>`;
}

export function countHtmlFiles(files: Pick<StaticPreviewFile, "name">[]): number {
    return files.filter((file) => /\.html?$/i.test(file.name)).length;
}

/**
 * Build the self-contained preview document. Returns null when the entry file
 * isn't present or the DOM isn't available (SSR), so callers can fall back.
 */
export function buildStaticPreviewDocument(params: {
    files: StaticPreviewFile[];
    entryPath: string;
}): string | null {
    if (typeof DOMParser === "undefined") return null;

    const byPath = new Map(
        params.files.map((file) => [normalizePreviewPath(file.name), file.content]),
    );
    const entryPath = normalizePreviewPath(params.entryPath);
    const entryHtml = byPath.get(entryPath);
    if (entryHtml === undefined) return null;

    const doc = new DOMParser().parseFromString(entryHtml, "text/html");

    const lookup = (ref: string): { path: string; content: string } | null => {
        if (isExternalRef(ref)) return null;
        const path = resolveRef(entryPath, ref);
        const content = byPath.get(path);
        return content === undefined ? null : { path, content };
    };

    doc.querySelectorAll("link[rel~='stylesheet'][href]").forEach((link) => {
        const resolved = lookup(link.getAttribute("href") ?? "");
        if (!resolved) return;

        const style = doc.createElement("style");
        style.textContent = resolved.content;
        link.replaceWith(style);
    });

    doc.querySelectorAll("script[src]").forEach((script) => {
        const resolved = lookup(script.getAttribute("src") ?? "");
        if (!resolved) return;

        const inlined = doc.createElement("script");
        for (const attribute of Array.from(script.attributes)) {
            if (attribute.name !== "src") inlined.setAttribute(attribute.name, attribute.value);
        }
        inlined.textContent = escapeScriptContent(resolved.content);
        script.replaceWith(inlined);
    });

    // SVGs are text, so they can be inlined as data URIs. Binary images aren't
    // stored as text in the workspace, so their src is left untouched.
    doc.querySelectorAll("img[src]").forEach((image) => {
        const resolved = lookup(image.getAttribute("src") ?? "");
        if (!resolved || !resolved.path.toLowerCase().endsWith(".svg")) return;

        image.setAttribute(
            "src",
            `data:image/svg+xml;utf8,${encodeURIComponent(resolved.content)}`,
        );
    });

    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
