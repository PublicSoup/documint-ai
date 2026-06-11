const DEFAULT_IGNORED_SEGMENTS = new Set([
    "node_modules",
    ".git",
    ".next",
    ".turbo",
    ".vercel",
    "dist",
    "build",
    "out",
    "coverage",
    ".cache",
    "Library",
    "vibe-coding-platform-main",
    "vibecoding",
    "vibe-coding",
    "vibe_coding",
]);

const GRAPHABLE_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".json",
    ".mdx",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".cs",
    ".php",
    ".rb",
]);

const TEXT_SOURCE_EXTENSIONS = new Set([
    ...GRAPHABLE_EXTENSIONS,
    ".html",
    ".htm",
    ".md",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    ".yaml",
    ".yml",
    ".xml",
    ".toml",
    ".ini",
    ".env",
    ".txt",
]);

const SPECIAL_FILENAMES = new Set([
    "dockerfile",
    "makefile",
    "package.json",
    "tsconfig.json",
    "jsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "next.config.ts",
    "next.config.js",
]);

export function normalizeProjectPath(input: string): string | null {
    const trimmed = input.trim().replace(/\\/g, "/").replace(/^file:\/+/i, "");
    if (!trimmed || trimmed.includes("\0")) return null;

    const withoutLeadingSlash = trimmed.replace(/^\/+/, "");
    const parts: string[] = [];
    for (const part of withoutLeadingSlash.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") return null;
        parts.push(part);
    }

    const normalized = parts.join("/");
    return normalized.length > 0 && normalized.length <= 1024 ? normalized : null;
}

export function getProjectPathExtension(projectPath: string): string {
    const basename = projectPath.split("/").pop() ?? projectPath;
    const dot = basename.lastIndexOf(".");
    return dot > -1 ? basename.slice(dot).toLowerCase() : "";
}

export function isIgnoredProjectPath(projectPath: string): boolean {
    const normalized = normalizeProjectPath(projectPath);
    if (!normalized) return true;

    const segments = normalized.split("/");
    return segments.some((segment) => DEFAULT_IGNORED_SEGMENTS.has(segment));
}

export function isFolderPlaceholderPath(projectPath: string, language?: string | null): boolean {
    return language === "folder" || projectPath.endsWith("/");
}

export function isTextSourcePath(projectPath: string): boolean {
    const normalized = normalizeProjectPath(projectPath);
    if (!normalized || isIgnoredProjectPath(normalized)) return false;

    const basename = normalized.split("/").pop()?.toLowerCase() ?? "";
    return SPECIAL_FILENAMES.has(basename) || TEXT_SOURCE_EXTENSIONS.has(getProjectPathExtension(normalized));
}

export function isGraphableSourcePath(projectPath: string, language?: string | null): boolean {
    const normalized = normalizeProjectPath(projectPath);
    if (!normalized || isIgnoredProjectPath(normalized) || isFolderPlaceholderPath(projectPath, language)) return false;

    const basename = normalized.split("/").pop()?.toLowerCase() ?? "";
    return SPECIAL_FILENAMES.has(basename) || GRAPHABLE_EXTENSIONS.has(getProjectPathExtension(normalized));
}

export function detectLanguageFromPath(projectPath: string): string {
    const basename = projectPath.split("/").pop()?.toLowerCase() ?? "";
    if (basename === "dockerfile") return "dockerfile";

    const ext = getProjectPathExtension(projectPath).slice(1);
    const languageMap: Record<string, string> = {
        ts: "typescript",
        tsx: "typescript",
        mts: "typescript",
        cts: "typescript",
        js: "javascript",
        jsx: "javascript",
        mjs: "javascript",
        cjs: "javascript",
        css: "css",
        scss: "scss",
        sass: "scss",
        less: "less",
        html: "html",
        htm: "html",
        json: "json",
        jsonc: "json",
        md: "markdown",
        mdx: "markdown",
        py: "python",
        rb: "ruby",
        rs: "rust",
        go: "go",
        java: "java",
        c: "c",
        h: "c",
        cpp: "cpp",
        hpp: "cpp",
        cc: "cpp",
        cs: "csharp",
        php: "php",
        sql: "sql",
        sh: "shell",
        bash: "shell",
        zsh: "shell",
        yaml: "yaml",
        yml: "yaml",
        xml: "xml",
        svg: "xml",
        graphql: "graphql",
        gql: "graphql",
        toml: "ini",
        ini: "ini",
        env: "plaintext",
        txt: "plaintext",
        log: "plaintext",
    };
    return languageMap[ext] ?? "plaintext";
}

export function safeStorageKeyForProjectPath(ownerId: string, projectPath: string): string {
    const normalized = normalizeProjectPath(projectPath) ?? "unnamed";
    const safePath = normalized
        .split("/")
        .map((segment) => encodeURIComponent(segment).replace(/%/g, "_"))
        .join("/");

    return `${ownerId}/${Date.now()}-${safePath}`;
}