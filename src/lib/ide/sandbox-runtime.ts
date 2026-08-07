import type { RuntimeKind } from "@/components/ide/shared/types";

export interface SandboxRuntimeFile {
    name: string;
    content: string;
}

export interface SandboxCommandPlan {
    /**
     * Optional blocking pre-step (e.g. `npm install`). Runs to completion before
     * `command`. If it exits non-zero the route aborts with the captured output.
     */
    setup?: { command: string; args: string[] };
    command: string;
    args: string[];
    wait: boolean;
    port?: number;
    /**
     * package.json content after dev-server host/port rewriting. When present the
     * route writes THIS instead of the client-supplied package.json so the dev
     * server binds 0.0.0.0 on the exposed port (required for `node` projects).
     */
    rewrittenPackageJson?: string;
}

type PackageManager = "npm" | "pnpm" | "yarn";

const SERVER_ENTRY_NAMES = new Set(["app.py", "main.py", "server.py", "index.php"]);
const WEBSITE_SCRIPT_CANDIDATES = ["dev", "start", "preview", "serve"] as const;

/**
 * Minimal static file server, run via `node -e`. Mirrors the WebContainer static
 * preview server used on desktop, trimmed for the sandbox. Serves the working
 * directory, defaults to index.html, and binds 0.0.0.0 on $PORT so Vercel
 * Sandbox can expose it.
 */
const STATIC_SERVER_SCRIPT = `
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const mime = { ".html":"text/html;charset=utf-8", ".css":"text/css;charset=utf-8", ".js":"text/javascript;charset=utf-8", ".mjs":"text/javascript;charset=utf-8", ".json":"application/json;charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".gif":"image/gif", ".webp":"image/webp", ".ico":"image/x-icon", ".woff2":"font/woff2", ".woff":"font/woff", ".wasm":"application/wasm" };
http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
    if (p === "/") p = "/index.html";
    while (p.charAt(0) === "/") p = p.slice(1);
    let filePath = path.resolve(root, p);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) { res.writeHead(400); res.end("Bad request"); return; }
    if (!fs.existsSync(filePath) && !path.extname(filePath)) filePath = path.join(root, "index.html");
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(port, "0.0.0.0", () => console.log("[documint-sandbox] static server on :" + port));
`.trim();

function hasFile(files: SandboxRuntimeFile[], name: string): boolean {
    return files.some((file) => file.name === name);
}

function firstFile(files: SandboxRuntimeFile[], predicate: (name: string) => boolean): string | undefined {
    return files.find((file) => predicate(file.name))?.name;
}

function findFile(files: SandboxRuntimeFile[], name: string): SandboxRuntimeFile | undefined {
    return files.find((file) => file.name === name);
}

function detectPackageManager(files: SandboxRuntimeFile[]): PackageManager {
    if (hasFile(files, "pnpm-lock.yaml")) return "pnpm";
    if (hasFile(files, "yarn.lock")) return "yarn";
    return "npm";
}

function installCommand(pm: PackageManager): { command: string; args: string[] } {
    switch (pm) {
        case "pnpm":
            return { command: "npx", args: ["pnpm", "install"] };
        case "yarn":
            return { command: "npx", args: ["yarn", "install", "--ignore-engines"] };
        case "npm":
        default:
            return { command: "npm", args: ["install"] };
    }
}

function runScriptCommand(pm: PackageManager, script: string): { command: string; args: string[] } {
    switch (pm) {
        case "pnpm":
            return { command: "npx", args: ["pnpm", "run", script] };
        case "yarn":
            return { command: "npx", args: ["yarn", "run", script] };
        case "npm":
        default:
            return script === "start"
                ? { command: "npm", args: ["start"] }
                : { command: "npm", args: ["run", script] };
    }
}

function parseScripts(content: string): Record<string, string> {
    try {
        const parsed = JSON.parse(content) as { scripts?: unknown };
        if (parsed.scripts && typeof parsed.scripts === "object" && !Array.isArray(parsed.scripts)) {
            return Object.fromEntries(
                Object.entries(parsed.scripts).filter(
                    (entry): entry is [string, string] => typeof entry[1] === "string",
                ),
            );
        }
    } catch {
        // fall through
    }
    return {};
}

function pickWebsiteScript(scripts: Record<string, string>): string | undefined {
    return WEBSITE_SCRIPT_CANDIDATES.find((name) => Boolean(scripts[name]));
}

/**
 * Rewrite a dev-server script so it binds 0.0.0.0 on a fixed port. Unlike the
 * WebContainer path — which listens for a `server-ready` event and accepts any
 * port — Vercel Sandbox exposes ONE known port, so the server must be pinned to
 * it. Covers the frameworks the IDE's templates and AI generator emit (Vite,
 * Next, Angular, Nuxt). Unknown scripts are returned unchanged.
 */
function bindDevScript(script: string, port: number): string {
    if (/\bvite\b/.test(script) && !script.includes("--host")) {
        return script.replace(/\bvite\b/, `vite --host 0.0.0.0 --port ${port}`);
    }
    if (/\bnext dev\b/.test(script) && !script.includes("-H") && !script.includes("--hostname")) {
        return script.replace(/\bnext dev\b/, `next dev -H 0.0.0.0 -p ${port}`);
    }
    if (/\bng serve\b/.test(script) && !script.includes("--host")) {
        return script.replace(/\bng serve\b/, `ng serve --host 0.0.0.0 --port ${port}`);
    }
    if (/\bnuxt dev\b/.test(script) && !script.includes("--host")) {
        return script.replace(/\bnuxt dev\b/, `nuxt dev --host 0.0.0.0 --port ${port}`);
    }
    return script;
}

/**
 * Produce a package.json string with the chosen website script rewritten to bind
 * 0.0.0.0:<port>, or undefined when nothing needed rewriting / parsing failed.
 */
function rewritePackageJsonForSandbox(content: string, script: string, port: number): string | undefined {
    try {
        const pkg = JSON.parse(content) as { scripts?: Record<string, unknown> };
        const original = pkg.scripts?.[script];
        if (typeof original !== "string") return undefined;
        const bound = bindDevScript(original, port);
        if (bound === original) return undefined;
        pkg.scripts![script] = bound;
        return JSON.stringify(pkg, null, 2);
    } catch {
        return undefined;
    }
}

export function getSandboxRuntime(runtimeKind: RuntimeKind): "node24" | "python3.13" {
    return runtimeKind === "python" ? "python3.13" : "node24";
}

export function getSandboxCommandPlan(params: {
    runtimeKind: RuntimeKind;
    entryFile?: string;
    files: SandboxRuntimeFile[];
    port?: number;
}): SandboxCommandPlan {
    const { runtimeKind, files, port = 3000 } = params;
    const entryFile = params.entryFile || firstFile(files, (name) => SERVER_ENTRY_NAMES.has(name));

    switch (runtimeKind) {
        case "node": {
            const packageFile = findFile(files, "package.json");
            if (!packageFile) {
                return { command: "node", args: ["--version"], wait: true };
            }
            const scripts = parseScripts(packageFile.content);
            const script = pickWebsiteScript(scripts);
            const pm = detectPackageManager(files);
            if (!script) {
                // No dev/start/preview/serve script — just prove the toolchain works.
                return { setup: installCommand(pm), command: "node", args: ["--version"], wait: true };
            }
            const run = runScriptCommand(pm, script);
            return {
                setup: installCommand(pm),
                command: run.command,
                args: run.args,
                wait: false,
                port,
                rewrittenPackageJson: rewritePackageJsonForSandbox(packageFile.content, script, port),
            };
        }
        case "static": {
            return { command: "node", args: ["-e", STATIC_SERVER_SCRIPT], wait: false, port };
        }
        case "python": {
            const target = entryFile && entryFile.endsWith(".py") ? entryFile : firstFile(files, (name) => name.endsWith(".py"));
            return target
                ? { command: "python", args: [target], wait: false, port }
                : { command: "python", args: ["--version"], wait: true };
        }
        case "php": {
            const root = hasFile(files, "index.php") ? "." : ".";
            return { command: "php", args: ["-S", `0.0.0.0:${port}`, "-t", root], wait: false, port };
        }
        case "go": {
            const target = entryFile && entryFile.endsWith(".go") ? entryFile : firstFile(files, (name) => name.endsWith(".go"));
            return target ? { command: "go", args: ["run", target], wait: false, port } : { command: "go", args: ["version"], wait: true };
        }
        case "rust":
            return { command: "cargo", args: ["run"], wait: false, port };
        case "java": {
            const target = entryFile && entryFile.endsWith(".java") ? entryFile : firstFile(files, (name) => name.endsWith(".java"));
            return target ? { command: "java", args: [target], wait: false, port } : { command: "java", args: ["--version"], wait: true };
        }
        case "shell": {
            const target = entryFile && /\.(sh|bash)$/.test(entryFile) ? entryFile : firstFile(files, (name) => /\.(sh|bash)$/.test(name));
            return target ? { command: "bash", args: [target], wait: true } : { command: "bash", args: ["--version"], wait: true };
        }
        default:
            return { command: "node", args: ["--version"], wait: true };
    }
}
