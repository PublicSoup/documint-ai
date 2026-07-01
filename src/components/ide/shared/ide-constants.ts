import type { IDEFile, IDELanguage, ParsedGitStatus, RuntimeProjectManifest } from "./types";

const LANGUAGE_BY_EXTENSION: Record<string, IDELanguage> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    mjs: "javascript",
    cjs: "javascript",
    css: "css",
    scss: "scss",
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

const DOCKERFILE_PATTERN = /(^|\/)dockerfile$/i;
const SAFE_WORKSPACE_PATH_PATTERN = /^[a-zA-Z0-9@._\-/]+$/;

export function getLanguageFromFileName(fileName: string): IDELanguage {
    const normalized = fileName.trim();
    if (DOCKERFILE_PATTERN.test(normalized)) return "dockerfile";

    const ext = normalized.split(".").pop()?.toLowerCase() || "";
    return LANGUAGE_BY_EXTENSION[ext] || "plaintext";
}

export function getStorageLanguageFromFileName(fileName: string): string {
    const language = getLanguageFromFileName(fileName);
    if (language === "typescriptreact") return "typescript";
    if (language === "javascriptreact") return "javascript";
    return language;
}

export function slugifyProjectName(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

    return slug || "project";
}

export function normalizeWorkspaceName(name: string): string {
    return name.replace(/^\/+/, "").replace(/\/+$/g, "").trim();
}

export function toWorkspaceRelativePath(name: string, workspacePrefix?: string | null): string | null {
    const normalizedName = normalizeWorkspaceName(name);
    if (!normalizedName) return null;

    if (workspacePrefix && workspacePrefix !== "Project") {
        const normalizedPrefix = `${normalizeWorkspaceName(workspacePrefix)}/`;
        if (!normalizedName.startsWith(normalizedPrefix)) return null;
        return normalizedName.slice(normalizedPrefix.length) || null;
    }

    return normalizedName;
}

export function isSafeWorkspacePath(path: string): boolean {
    const normalized = normalizeWorkspaceName(path);
    if (!normalized) return false;
    if (normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\\") || normalized.includes("\n")) return false;
    return SAFE_WORKSPACE_PATH_PATTERN.test(normalized);
}

export function extractTopLevelFolders(files: Pick<IDEFile, "name">[]): string[] {
    const topLevelFolders = new Set<string>();
    files.forEach((file) => {
        const [firstPart] = normalizeWorkspaceName(file.name).split("/");
        if (firstPart && firstPart !== normalizeWorkspaceName(file.name)) {
            topLevelFolders.add(firstPart);
        }
    });

    return Array.from(topLevelFolders).sort((a, b) => a.localeCompare(b));
}

export function filterFilesByWorkspace<T extends Pick<IDEFile, "name">>(files: T[], workspacePrefix: string): T[] {
    if (workspacePrefix === "Project") return files;

    const prefix = `${normalizeWorkspaceName(workspacePrefix)}/`;
    return files.filter((file) => normalizeWorkspaceName(file.name).startsWith(prefix));
}

export function getRunnableWorkspaceCandidates(files: IDEFile[]): RuntimeProjectManifest[] {
    return extractTopLevelFolders(files)
        .map((workspace) => ({ ...detectRuntimeProject(files, workspace), workspace }))
        .filter((manifest) => manifest.kind !== "unknown" && Boolean(manifest.entryFile));
}

export function choosePreferredWorkspace(files: IDEFile[]): string | null {
    // Prefer the whole project. If the ROOT is itself runnable — a website
    // template with index.html or package.json at the top level — keep the
    // "Project" workspace so the entire project is shown and previewed as one.
    // Returning null tells the caller not to narrow to a subfolder.
    const rootProject = detectRuntimeProject(files, "Project");
    if (rootProject.kind !== "unknown" && Boolean(rootProject.entryFile)) {
        return null;
    }

    // The root isn't a project on its own (e.g. a monorepo with the app under a
    // subdirectory). Narrow to the best runnable subfolder. Never fall back to an
    // arbitrary non-runnable folder — that hides the rest of the tree and
    // previews nothing.
    const runnable = extractTopLevelFolders(files)
        .map((workspace) => ({ workspace, manifest: detectRuntimeProject(files, workspace) }))
        .filter(({ manifest }) => manifest.kind !== "unknown" && Boolean(manifest.entryFile));

    return runnable.find(({ manifest }) => manifest.kind === "node")?.workspace
        ?? runnable.find(({ manifest }) => manifest.kind === "static")?.workspace
        ?? runnable[0]?.workspace
        ?? null;
}

export function parseGitStatus(rawStatus: string): ParsedGitStatus {
    const lines = rawStatus
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean);

    const branchLine = lines.find((line) => line.startsWith("##"));
    const branch = branchLine ? branchLine.replace(/^##\s+/, "").split("...")[0]?.trim() || "HEAD" : "main";
    const files = lines
        .filter((line) => !line.startsWith("##"))
        .map((line) => {
            const status = line.substring(0, 2).trim() || "M";
            const path = line.substring(3).trim();
            return { path, status };
        })
        .filter((file) => file.path.length > 0);

    return { branch, dirty: files.length > 0, files };
}

export function detectRuntimeProject(files: IDEFile[], workspacePrefix?: string | null): RuntimeProjectManifest {
    const findWorkspaceFile = (path: string) => files.find((file) => toWorkspaceRelativePath(file.name, workspacePrefix) === path);
    const findWorkspaceFileByExt = (extensions: string[]) => files.find((file) => {
        const relativePath = toWorkspaceRelativePath(file.name, workspacePrefix);
        return relativePath ? extensions.some((extension) => relativePath.toLowerCase().endsWith(extension)) : false;
    });

    const packageFile = findWorkspaceFile("package.json");
    if (packageFile) {
        return {
            kind: "node",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            packageFile,
            entryFile: "package.json",
            previewableInBrowser: true,
            reason: "package.json detected",
        };
    }

    const cargoFile = findWorkspaceFile("Cargo.toml");
    if (cargoFile) {
        const mainFile = findWorkspaceFile("src/main.rs");
        return {
            kind: "rust",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            cargoFile,
            entryFile: mainFile?.name || "Cargo.toml",
            previewableInBrowser: false,
            requiresSandbox: true,
            reason: "Cargo.toml detected",
        };
    }

    const pythonEntry = findWorkspaceFile("main.py") || findWorkspaceFile("app.py") || findWorkspaceFileByExt([".py"]);
    if (pythonEntry || findWorkspaceFile("requirements.txt") || findWorkspaceFile("pyproject.toml")) {
        return {
            kind: "python",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            entryFile: pythonEntry?.name || "pyproject.toml",
            previewableInBrowser: false,
            requiresSandbox: true,
            reason: "Python project files detected",
        };
    }

    const goEntry = findWorkspaceFile("main.go") || findWorkspaceFileByExt([".go"]);
    if (goEntry || findWorkspaceFile("go.mod")) {
        return {
            kind: "go",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            entryFile: goEntry?.name || "go.mod",
            previewableInBrowser: false,
            requiresSandbox: true,
            reason: "Go project files detected",
        };
    }

    const javaEntry = findWorkspaceFileByExt([".java"]);
    if (javaEntry || findWorkspaceFile("pom.xml") || findWorkspaceFile("build.gradle") || findWorkspaceFile("build.gradle.kts")) {
        return {
            kind: "java",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            entryFile: javaEntry?.name || "pom.xml",
            previewableInBrowser: false,
            requiresSandbox: true,
            reason: "Java project files detected",
        };
    }

    const phpEntry = findWorkspaceFile("index.php") || findWorkspaceFileByExt([".php"]);
    if (phpEntry || findWorkspaceFile("composer.json")) {
        return {
            kind: "php",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            entryFile: phpEntry?.name || "composer.json",
            previewableInBrowser: false,
            requiresSandbox: true,
            reason: "PHP project files detected",
        };
    }

    const shellEntry = findWorkspaceFile("run.sh") || findWorkspaceFileByExt([".sh", ".bash"]);
    if (shellEntry) {
        return {
            kind: "shell",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            entryFile: shellEntry.name,
            previewableInBrowser: false,
            requiresSandbox: true,
            reason: "Shell entrypoint detected",
        };
    }

    const dockerFile = files.find((file) => {
        const relativePath = toWorkspaceRelativePath(file.name, workspacePrefix);
        return Boolean(relativePath && DOCKERFILE_PATTERN.test(relativePath));
    });
    if (dockerFile) {
        return {
            kind: "docker",
            workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
            entryFile: dockerFile.name,
            previewableInBrowser: false,
            requiresSandbox: true,
            reason: "Dockerfile detected",
        };
    }

    const staticEntry = findWorkspaceFile("index.html");
    return {
        kind: staticEntry ? "static" : "unknown",
        workspace: workspacePrefix && workspacePrefix !== "Project" ? normalizeWorkspaceName(workspacePrefix) : undefined,
        entryFile: staticEntry?.name,
        previewableInBrowser: Boolean(staticEntry),
        requiresSandbox: false,
        reason: staticEntry ? "index.html detected" : "No recognized runtime entrypoint detected",
    };
}

export async function getResponseErrorMessage(response: Response, fallback = "Request failed"): Promise<string> {
    const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    return data?.message || data?.error || response.statusText || fallback;
}