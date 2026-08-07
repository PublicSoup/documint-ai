import path from "node:path";
import type { BuildResult, Loader, OutputFile, Plugin } from "esbuild";

/**
 * Tier 2 preview bundling: turn a React/Vite-style workspace into ONE
 * self-contained script, without `npm install` and without a sandbox VM.
 *
 * Why bundle everything (including React) instead of using a CDN/import map:
 * the preview is rendered through the iframe's `srcdoc`, and a srcdoc document
 * INHERITS the embedding page's Content-Security-Policy. Measured in-browser:
 * external `<script src>`, `import()` and `fetch()` to esm.sh are all blocked by
 * the app's CSP. An inline bundle makes zero network requests, so it runs under
 * the existing policy untouched.
 *
 * esbuild only parses and transforms the user's code here — it never executes it.
 */

/**
 * Bare imports are resolved from THIS app's node_modules, so the set must be
 * closed. Without it, generated code could `import { db } from "@/lib/db"` (or
 * pull in any server module) and esbuild would happily inline our server source —
 * secrets included — into a document we hand back to the browser. Anything not
 * listed fails the build, and the caller falls back to WebContainer/sandbox.
 */
const ALLOWED_PACKAGES = new Set([
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "react-dom",
    "react-dom/client",
    "scheduler",
]);

const LOADER_BY_EXTENSION: Record<string, Loader> = {
    ".ts": "ts",
    ".tsx": "tsx",
    ".js": "js",
    ".jsx": "jsx",
    ".mjs": "js",
    ".cjs": "js",
    ".css": "css",
    ".json": "json",
    ".svg": "text",
    ".txt": "text",
};

const RESOLVE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json", ".css"];

/** Entry files tried in order when index.html doesn't name one. */
const ENTRY_CANDIDATES = [
    "src/main.tsx",
    "src/main.jsx",
    "src/main.ts",
    "src/main.js",
    "src/index.tsx",
    "src/index.jsx",
    "src/index.ts",
    "src/index.js",
    "index.tsx",
    "index.jsx",
];

export interface BundleInput {
    name: string;
    content: string;
}

export interface BundleOutcome {
    ok: boolean;
    js?: string;
    css?: string;
    /** Entry that was bundled, for logging. */
    entry?: string;
    errors?: string[];
}

function normalize(filePath: string): string {
    return path.posix.normalize(filePath).replace(/^\.\//, "").replace(/^\/+/, "");
}

/** Pull the module entry out of `<script type="module" src="...">` in index.html. */
export function findHtmlModuleEntry(html: string): string | null {
    const match = html.match(
        /<script[^>]+type=["']module["'][^>]*\ssrc=["']([^"']+)["']/i,
    ) ?? html.match(/<script[^>]+\ssrc=["']([^"']+)["'][^>]*type=["']module["']/i);
    return match ? normalize(match[1]) : null;
}

export function resolveEntry(files: BundleInput[], html?: string): string | null {
    const names = new Set(files.map((file) => normalize(file.name)));

    if (html) {
        const declared = findHtmlModuleEntry(html);
        if (declared && names.has(declared)) return declared;
    }

    return ENTRY_CANDIDATES.find((candidate) => names.has(candidate)) ?? null;
}

function loaderFor(filePath: string): Loader {
    return LOADER_BY_EXTENSION[path.posix.extname(filePath).toLowerCase()] ?? "text";
}

/**
 * Build the workspace into a single IIFE. `js` is safe to inline in a <script>
 * tag; `css` (if any) into a <style> tag.
 */
export async function bundleSpaPreview(params: {
    files: BundleInput[];
    entry: string;
}): Promise<BundleOutcome> {
    const byPath = new Map(
        params.files.map((file) => [normalize(file.name), file.content]),
    );
    const entry = normalize(params.entry);
    if (!byPath.has(entry)) {
        return { ok: false, errors: [`Entry file not found: ${entry}`] };
    }

    const resolveWorkspace = (from: string, request: string): string | null => {
        const base = normalize(path.posix.join(path.posix.dirname(from), request));
        if (base.startsWith("..")) return null; // never escape the workspace
        if (byPath.has(base)) return base;

        for (const extension of RESOLVE_EXTENSIONS) {
            if (byPath.has(`${base}${extension}`)) return `${base}${extension}`;
        }
        for (const extension of RESOLVE_EXTENSIONS) {
            if (byPath.has(`${base}/index${extension}`)) return `${base}/index${extension}`;
        }
        return null;
    };

    const workspacePlugin: Plugin = {
        name: "documint-workspace",
        setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === "entry-point") {
                    return { path: entry, namespace: "workspace" };
                }

                // Only govern imports that originate in the user's workspace. Once
                // esbuild descends into node_modules (React's own internal
                // `./cjs/react.development.js` requires) it must resolve normally —
                // otherwise those relative paths are mistaken for workspace files.
                if (args.namespace !== "workspace") return undefined;

                if (args.path.startsWith(".") || args.path.startsWith("/")) {
                    const resolved = resolveWorkspace(args.importer, args.path);
                    return resolved
                        ? { path: resolved, namespace: "workspace" }
                        : {
                            errors: [
                                { text: `Cannot resolve "${args.path}" from "${args.importer}"` },
                            ],
                        };
                }

                // Bare import — only the closed allowlist may come from our node_modules.
                if (!ALLOWED_PACKAGES.has(args.path)) {
                    return {
                        errors: [
                            {
                                text: `Package "${args.path}" isn't available in the fast preview. Run the project to install it.`,
                            },
                        ],
                    };
                }

                return undefined; // let esbuild resolve it normally
            });

            build.onLoad({ filter: /.*/, namespace: "workspace" }, (args) => ({
                contents: byPath.get(args.path) ?? "",
                loader: loaderFor(args.path),
                resolveDir: process.cwd(),
            }));
        },
    };

    let result: BuildResult;
    try {
        const esbuild = await import("esbuild");
        result = await esbuild.build({
            entryPoints: [entry],
            absWorkingDir: process.cwd(),
            bundle: true,
            write: false,
            // Never written to disk (write:false), but esbuild still needs an output
            // path to split a CSS bundle out of the JS entry — without it, any
            // `import "./index.css"` fails the build.
            outdir: "documint-preview",
            format: "iife",
            platform: "browser",
            target: "es2020",
            jsx: "automatic",
            // The bundle is inlined into the preview document and re-sent on every
            // Run, so payload size is felt directly on mobile data. React's
            // production build renders identically to dev and is ~8x smaller; errors
            // in the user's own code still throw normally.
            minify: true,
            sourcemap: false,
            logLevel: "silent",
            // Don't inherit the app's tsconfig — its `paths` aliases (@/…) would let
            // generated code reach into our own source tree.
            tsconfigRaw: "{}",
            define: { "process.env.NODE_ENV": '"production"' },
            plugins: [workspacePlugin],
        });
    } catch (error) {
        const messages =
            error && typeof error === "object" && "errors" in error
                ? ((error as { errors?: { text?: string }[] }).errors ?? [])
                      .map((item) => item.text ?? "")
                      .filter(Boolean)
                : [error instanceof Error ? error.message : String(error)];
        return { ok: false, entry, errors: messages.length > 0 ? messages : ["Bundle failed"] };
    }

    const outputs: OutputFile[] = result.outputFiles ?? [];
    const js = outputs.find((file) => file.path.endsWith(".js"))?.text;
    const css = outputs.find((file) => file.path.endsWith(".css"))?.text;

    if (!js) return { ok: false, entry, errors: ["Bundler produced no JavaScript output"] };
    return { ok: true, js, css, entry };
}
