import type { RuntimeKind } from "@/components/ide/shared/types";

export interface SandboxRuntimeFile {
    name: string;
    content: string;
}

export interface SandboxCommandPlan {
    command: string;
    args: string[];
    wait: boolean;
    port?: number;
}

const SERVER_ENTRY_NAMES = new Set(["app.py", "main.py", "server.py", "index.php"]);

function hasFile(files: SandboxRuntimeFile[], name: string): boolean {
    return files.some((file) => file.name === name);
}

function firstFile(files: SandboxRuntimeFile[], predicate: (name: string) => boolean): string | undefined {
    return files.find((file) => predicate(file.name))?.name;
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