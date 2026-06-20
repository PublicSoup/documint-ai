import { useCallback, useEffect, useRef, useState } from "react";
import type { WebContainerProcess } from "@webcontainer/api";
import type { Terminal as XTerm } from "@xterm/xterm";
import type {
  IDEFile,
  RuntimeErrorCode,
  RuntimeErrorInfo,
  RuntimeProjectManifest,
} from "@/components/ide/shared/types";
import {
  extractTopLevelFolders,
  getRunnableWorkspaceCandidates,
  detectRuntimeProject,
  isSafeWorkspacePath,
  toWorkspaceRelativePath,
} from "@/components/ide/shared/ide-constants";
import {
  compactRuntimeLogLine,
  type RuntimeCommand,
  type RuntimeLogLine,
} from "@/lib/ide/runtime-events";
import { WebContainerManager } from "@/lib/web-container";

export type RunStatus = "idle" | "installing" | "starting" | "ready" | "error";

interface UseExecutionEngineProps {
  files: IDEFile[];
  activeFileId?: string;
  fileContents: Record<string, string>;
  terminalInstance: XTerm | null;
  workspacePrefix?: string | null;
  envSecrets?: { key: string; value: string }[];
}

type WebContainerMountTree = Record<
  string,
  { file: { contents: string } } | { directory: WebContainerMountTree }
>;
type PackageManager = "npm" | "pnpm" | "yarn";
type CliCommand = { command: string; args: string[] };
type RuntimeTerminal = Pick<XTerm, "write" | "writeln"> | null;

const SAFE_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SERVER_READY_TIMEOUT_MS = 30_000;
const LOCKFILE_NAMES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const;
const STATIC_ENTRY_CANDIDATES = [
  "index.html",
  "public/index.html",
  "dist/index.html",
  "build/index.html",
  "out/index.html",
] as const;
const WEBSITE_SCRIPT_CANDIDATES = ["dev", "start", "preview", "serve"] as const;
const RUNTIME_SERVER_ENV = {
  HOST: "0.0.0.0",
  HOSTNAME: "0.0.0.0",
  PORT: "3000",
  BROWSER: "none",
  CI: "1",
};

const RUNTIME_ERROR_HINTS: Record<RuntimeErrorCode, string> = {
  TERMINAL_NOT_READY:
    "The runtime can still run, but the terminal UI did not mount fast enough. Reopen the terminal or retry the run action.",
  WEBCONTAINER_BOOT_FAILED:
    "Refresh the IDE and try again. WebContainers require cross-origin isolation and may fail if the browser blocks SharedArrayBuffer.",
  INSTALL_FAILED:
    "Check dependency names, package versions, and package manager lockfiles. Try simplifying package.json if install keeps failing.",
  PACKAGE_JSON_INVALID:
    "Fix package.json syntax. If this is a static site, keep index.html so DocuMint can fall back to static preview.",
  SCRIPT_NOT_FOUND:
    "Add a scripts.dev or scripts.start entry to package.json, or include index.html for static preview.",
  ENTRYPOINT_NOT_FOUND:
    "Add index.html for static sites or package.json with a dev/start script for Node projects.",
  SERVER_READY_TIMEOUT:
    "Ensure the dev server binds to 0.0.0.0 and prints/listens on a port WebContainer can expose.",
  SERVER_EXITED:
    "Check the terminal logs for the first compile/runtime error before the server exited.",
  UNSUPPORTED_BROWSER_RUNTIME:
    "This language needs the server sandbox runtime rather than the browser WebContainer preview.",
  SANDBOX_UNAVAILABLE:
    "Configure Vercel Sandbox in production or run a browser-supported static/Node project instead.",
  SANDBOX_FAILED:
    "Review sandbox command output and verify the detected entrypoint can run non-interactively.",
  NO_PREVIEW_AVAILABLE:
    "The code executed, but no web server/port was exposed for iframe preview. Check terminal output for CLI results.",
  UNKNOWN_RUNTIME_ERROR:
    "Review the terminal/runtime logs, then retry after fixing the first reported error.",
};

interface SandboxRuntimeResponse {
  sandboxId?: string;
  commandId?: string;
  previewUrl?: string;
  stdout?: string;
  stderr?: string;
  message?: string;
  code?: string;
}

const STATIC_PREVIEW_SERVER_SCRIPT = `
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const resolvedRoot = path.resolve(process.cwd());
let port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function send(res, status, body, contentType) {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

function safeResolve(rawUrl) {
  try {
    const pathname = decodeURIComponent(new URL(rawUrl || "/", "http://localhost").pathname);
    const requestPath = pathname === "/" ? "index.html" : pathname.replace(/^\\/+/, "");
    const filePath = path.resolve(resolvedRoot, requestPath);
    return filePath === resolvedRoot || filePath.startsWith(resolvedRoot + path.sep) ? filePath : null;
  } catch {
    return null;
  }
}

async function readStaticFile(filePath) {
  const stats = await fs.stat(filePath);
  return await fs.readFile(stats.isDirectory() ? path.join(filePath, "index.html") : filePath);
}

const server = http.createServer(async (req, res) => {
  const filePath = safeResolve(req.url);
  if (!filePath) {
    send(res, 400, "Bad request", "text/plain; charset=utf-8");
    return;
  }

  try {
    const data = await readStaticFile(filePath);
    const ext = path.extname(filePath).toLowerCase() || ".html";
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch {
    if (!path.extname(filePath)) {
      try {
        const data = await fs.readFile(path.join(resolvedRoot, "index.html"));
        res.writeHead(200, { "Content-Type": mimeTypes[".html"], "Cache-Control": "no-store" });
        res.end(data);
        return;
      } catch {}
    }

    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE" && port < 3010) {
    port += 1;
    server.listen(port, "0.0.0.0");
    return;
  }

  throw error;
});

server.listen(port, "0.0.0.0", () => {
  console.log("[documint-preview] Static server ready on http://localhost:" + port);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
`;

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

function formatCommand({ command, args }: CliCommand): string {
  return [command, ...args].join(" ");
}

function getInstallCommand(packageManager: PackageManager): CliCommand {
  switch (packageManager) {
    case "pnpm":
      return { command: "npx", args: ["pnpm", "install"] };
    case "yarn":
      return { command: "npx", args: ["yarn", "install", "--ignore-engines"] };
    case "npm":
      return { command: "npm", args: ["install"] };
    default: {
      const exhaustive: never = packageManager;
      return exhaustive;
    }
  }
}

function getScriptCommand(
  packageManager: PackageManager,
  scriptName: string,
): CliCommand {
  switch (packageManager) {
    case "pnpm":
      return { command: "npx", args: ["pnpm", "run", scriptName] };
    case "yarn":
      return { command: "npx", args: ["yarn", "run", scriptName] };
    case "npm":
      return scriptName === "start"
        ? { command: "npm", args: ["start"] }
        : { command: "npm", args: ["run", scriptName] };
    default: {
      const exhaustive: never = packageManager;
      return exhaustive;
    }
  }
}

function serializeEnvSecrets(
  secrets: { key: string; value: string }[],
): string {
  return secrets
    .filter((secret) => SAFE_ENV_KEY_PATTERN.test(secret.key.trim()))
    .map((secret) => `${secret.key.trim()}=${JSON.stringify(secret.value)}`)
    .join("\n");
}

function getPackageScripts(content: string): {
  scripts: Record<string, string>;
  error?: string;
} {
  try {
    const parsed = JSON.parse(content) as { scripts?: unknown };
    const scripts =
      parsed.scripts &&
      typeof parsed.scripts === "object" &&
      !Array.isArray(parsed.scripts)
        ? Object.fromEntries(
            Object.entries(parsed.scripts).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          )
        : {};

    return { scripts };
  } catch (error) {
    return {
      scripts: {},
      error: error instanceof Error ? error.message : "Invalid package.json",
    };
  }
}

function getWebsiteScriptName(scripts: Record<string, string>): string | null {
  return (
    WEBSITE_SCRIPT_CANDIDATES.find((scriptName) =>
      Boolean(scripts[scriptName]),
    ) ?? null
  );
}

function getStaticPreviewRoot(entryPath: string): string | undefined {
  const directory = entryPath.split("/").slice(0, -1).join("/");
  return directory || undefined;
}

export function useExecutionEngine({
  files,
  activeFileId,
  fileContents,
  terminalInstance,
  workspacePrefix,
  envSecrets = [],
}: UseExecutionEngineProps) {
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [webContainerBooted, setWebContainerBooted] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isRuntimeTaskRunning, setIsRuntimeTaskRunning] = useState(false);
  const [runtimeCommands, setRuntimeCommands] = useState<RuntimeCommand[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLogLine[]>([]);
  const [runtimeError, setRuntimeError] = useState<RuntimeErrorInfo | null>(
    null,
  );

  const termRef = useRef<XTerm | null>(terminalInstance);
  const bootedRef = useRef<boolean>(webContainerBooted);
  const filesRef = useRef(files);
  const fileContentsRef = useRef(fileContents);
  const envSecretsRef = useRef(envSecrets);
  const runtimeProcessRef = useRef<WebContainerProcess | null>(null);
  const previewUrlRef = useRef<string | null>(previewUrl);
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webContainerGenerationRef = useRef(
    WebContainerManager.getHealthSnapshot().generation,
  );
  const serverReadyGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    termRef.current = terminalInstance;
  }, [terminalInstance]);

  useEffect(() => {
    bootedRef.current = webContainerBooted;
  }, [webContainerBooted]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    fileContentsRef.current = fileContents;
  }, [fileContents]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    envSecretsRef.current = envSecrets;
  }, [envSecrets]);

  const clearPreviewTimeout = useCallback(() => {
    if (!previewTimeoutRef.current) return;
    clearTimeout(previewTimeoutRef.current);
    previewTimeoutRef.current = null;
  }, []);

  useEffect(() => clearPreviewTimeout, [clearPreviewTimeout]);

  useEffect(() => {
    return WebContainerManager.subscribeToHealth((health) => {
      if (health.generation === webContainerGenerationRef.current) return;

      webContainerGenerationRef.current = health.generation;
      serverReadyGenerationRef.current = null;
      bootedRef.current = false;
      runtimeProcessRef.current = null;
      previewUrlRef.current = null;
      clearPreviewTimeout();
      setWebContainerBooted(false);
      setPreviewUrl(null);
      setRunStatus((current) => (current === "error" ? current : "idle"));
    });
  }, [clearPreviewTimeout]);

  const upsertCommand = useCallback((command: RuntimeCommand) => {
    setRuntimeCommands((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === command.id);
      if (existingIndex === -1) return [...prev, command].slice(-30);

      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...command };
      return next;
    });
  }, []);

  const appendRuntimeLog = useCallback((line: RuntimeLogLine) => {
    const compacted = compactRuntimeLogLine(line);
    setRuntimeLogs((prev) => [...prev, compacted].slice(-200));
  }, []);

  const writeRuntimeLine = useCallback(
    (
      term: RuntimeTerminal,
      data: string,
      stream: RuntimeLogLine["stream"] = "stdout",
    ) => {
      term?.writeln(data);
      appendRuntimeLog({
        commandId: "runtime-system",
        command: "runtime",
        args: [],
        stream,
        data: `${data}\n`,
        timestamp: Date.now(),
      });
    },
    [appendRuntimeLog],
  );

  const failRuntime = useCallback(
    (params: {
      code: RuntimeErrorCode;
      message: string;
      details?: string;
      term?: RuntimeTerminal;
    }) => {
      const errorInfo: RuntimeErrorInfo = {
        code: params.code,
        message: params.message,
        hint: RUNTIME_ERROR_HINTS[params.code],
        details: params.details,
      };

      setRuntimeError(errorInfo);
      setRunStatus("error");
      writeRuntimeLine(
        params.term ?? termRef.current,
        `\r\nError [${errorInfo.code}]: ${errorInfo.message}\r\nHint: ${errorInfo.hint}${errorInfo.details ? `\r\nDetails: ${errorInfo.details}` : ""}\r\n`,
        "stderr",
      );
      return errorInfo;
    },
    [writeRuntimeLine],
  );

  const spawnTracked = useCallback(
    async (
      command: string,
      args: string[],
      term: RuntimeTerminal,
      options: {
        background?: boolean;
        cwd?: string;
        env?: Record<string, string>;
      } = {},
    ) => {
      const commandId = `${command}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const startedAt = Date.now();

      upsertCommand({
        id: commandId,
        command,
        args,
        status: "running",
        startedAt,
      });
      const process = await WebContainerManager.spawn(command, {
        args,
        cwd: options.cwd,
        env: options.env,
      });

      void process.output
        .pipeTo(
          new WritableStream({
            write(data) {
              term?.write(data);
              appendRuntimeLog({
                commandId,
                command,
                args,
                stream:
                  /\berror\b|failed|exception|traceback|syntaxerror|typeerror/i.test(
                    data,
                  )
                    ? "stderr"
                    : "stdout",
                data,
                timestamp: Date.now(),
              });
            },
          }),
        )
        .catch((error) => {
          appendRuntimeLog({
            commandId,
            command,
            args,
            stream: "stderr",
            data: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
        });

      if (!options.background) {
        const exitCode = await process.exit;
        upsertCommand({
          id: commandId,
          command,
          args,
          status: exitCode === 0 ? "done" : "error",
          exitCode,
          startedAt,
          completedAt: Date.now(),
        });
        return { process, exitCode, commandId };
      }

      void process.exit
        .then((exitCode) => {
          upsertCommand({
            id: commandId,
            command,
            args,
            status: exitCode === 0 ? "done" : "error",
            exitCode,
            startedAt,
            completedAt: Date.now(),
          });
        })
        .catch((error) => {
          appendRuntimeLog({
            commandId,
            command,
            args,
            stream: "stderr",
            data: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
          upsertCommand({
            id: commandId,
            command,
            args,
            status: "error",
            startedAt,
            completedAt: Date.now(),
          });
        });

      return { process, commandId };
    },
    [appendRuntimeLog, upsertCommand],
  );

  const startPreviewTimeout = useCallback(
    (term: RuntimeTerminal, label: string) => {
      clearPreviewTimeout();
      previewTimeoutRef.current = setTimeout(() => {
        if (!runtimeProcessRef.current || previewUrlRef.current) return;

        failRuntime({
          code: "SERVER_READY_TIMEOUT",
          message: `${label} did not expose a preview URL within ${SERVER_READY_TIMEOUT_MS / 1000}s.`,
          details:
            "Check that the server binds to 0.0.0.0 and does not crash during startup.",
          term,
        });
        previewTimeoutRef.current = null;
      }, SERVER_READY_TIMEOUT_MS);
    },
    [clearPreviewTimeout, failRuntime],
  );

  const stopCurrentRuntime = useCallback(
    (term?: XTerm | null) => {
      const process = runtimeProcessRef.current;
      if (!process) return;

      term?.writeln("\r\n> Stopping previous runtime...\r\n");
      try {
        process.kill();
      } catch (error) {
        console.warn("Failed to stop previous WebContainer process:", error);
      } finally {
        clearPreviewTimeout();
        runtimeProcessRef.current = null;
        previewUrlRef.current = null;
        setPreviewUrl(null);
      }
    },
    [clearPreviewTimeout],
  );

  const spawnRuntimeProcess = useCallback(
    async (
      command: string,
      args: string[],
      term: RuntimeTerminal,
      label: string,
      options: { cwd?: string; env?: Record<string, string> } = {},
    ) => {
      const { process } = await spawnTracked(command, args, term, {
        background: true,
        cwd: options.cwd,
        env: options.env,
      });
      runtimeProcessRef.current = process;
      startPreviewTimeout(term, label);

      void process.exit
        .then((exitCode) => {
          if (runtimeProcessRef.current !== process) return;

          clearPreviewTimeout();
          runtimeProcessRef.current = null;
          if (!previewUrlRef.current) {
            failRuntime({
              code: "SERVER_EXITED",
              message: `${label} exited before the preview server became ready.`,
              details: `Exit code ${exitCode}`,
              term,
            });
          }
        })
        .catch((error) => {
          if (runtimeProcessRef.current !== process) return;

          clearPreviewTimeout();
          runtimeProcessRef.current = null;
          failRuntime({
            code: "UNKNOWN_RUNTIME_ERROR",
            message: `${label} failed to start.`,
            details: error instanceof Error ? error.message : String(error),
            term,
          });
        });

      return process;
    },
    [clearPreviewTimeout, failRuntime, spawnTracked, startPreviewTimeout],
  );

  const getWorkspacePath = useCallback(
    (name: string, workspaceOverride?: string | null) => {
      const path = toWorkspaceRelativePath(
        name,
        workspaceOverride ?? workspacePrefix,
      );
      return path && isSafeWorkspacePath(path) ? path : null;
    },
    [workspacePrefix],
  );

  const getMountContent = useCallback((file: IDEFile) => {
    return Object.prototype.hasOwnProperty.call(
      fileContentsRef.current,
      file.id,
    )
      ? fileContentsRef.current[file.id]
      : file.content || "";
  }, []);

  const getWorkspaceFile = useCallback(
    (relativePath: string, workspaceOverride?: string | null) => {
      const effectiveWorkspace = workspaceOverride ?? workspacePrefix;
      return filesRef.current.find(
        (file) =>
          toWorkspaceRelativePath(file.name, effectiveWorkspace) ===
          relativePath,
      );
    },
    [workspacePrefix],
  );

  const getWorkspaceFileContent = useCallback(
    (relativePath: string, workspaceOverride?: string | null) => {
      const file = getWorkspaceFile(relativePath, workspaceOverride);
      return file ? getMountContent(file) : null;
    },
    [getMountContent, getWorkspaceFile],
  );

  const detectPackageManager = useCallback(
    (workspaceOverride?: string | null): PackageManager => {
      if (getWorkspaceFile("pnpm-lock.yaml", workspaceOverride)) return "pnpm";
      if (getWorkspaceFile("yarn.lock", workspaceOverride)) return "yarn";
      return "npm";
    },
    [getWorkspaceFile],
  );

  const getInstallFingerprint = useCallback(
    (
      packageJsonFile: IDEFile,
      packageManager: PackageManager,
      workspaceOverride?: string | null,
    ) => {
      const effectiveWorkspace = workspaceOverride ?? workspacePrefix;
      const fragments = [
        `generation:${webContainerGenerationRef.current}`,
        `workspace:${effectiveWorkspace || "Project"}`,
        `manager:${packageManager}`,
        `package.json:${getMountContent(packageJsonFile)}`,
        ...LOCKFILE_NAMES.map(
          (name) =>
            `${name}:${getWorkspaceFileContent(name, effectiveWorkspace) || ""}`,
        ),
      ];

      return hashString(fragments.join("\n---documint-runtime---\n"));
    },
    [getMountContent, getWorkspaceFileContent, workspacePrefix],
  );

  const getInstallKeyPath = useCallback(
    (workspaceOverride?: string | null) => {
      return `.documint-install-${hashString(workspaceOverride || workspacePrefix || "Project")}.key`;
    },
    [workspacePrefix],
  );

  const mountAll = useCallback(
    async (
      fileList: IDEFile[] = filesRef.current,
      workspaceOverride?: string | null,
    ) => {
      const fileMounts: WebContainerMountTree = {};
      const effectiveWorkspace = workspaceOverride ?? workspacePrefix;

      const ensureDir = (
        root: WebContainerMountTree,
        pathParts: string[],
      ): WebContainerMountTree => {
        let current = root;
        for (const part of pathParts) {
          if (!current[part]) {
            current[part] = { directory: {} };
          }
          const entry = current[part];
          if ("file" in entry) {
            current[part] = { directory: {} };
          }
          current = (current[part] as { directory: WebContainerMountTree })
            .directory;
        }
        return current;
      };

      fileList.forEach((file) => {
        let name = getWorkspacePath(file.name, effectiveWorkspace);
        if (!name) return;
        name = name.trim();
        if (!isSafeWorkspacePath(name)) return;

        if (name.includes("/")) {
          const parts = name.split("/");
          const fileName = parts.pop();
          if (!fileName) return;
          const directory = ensureDir(fileMounts, parts);
          directory[fileName] = { file: { contents: getMountContent(file) } };
          return;
        }

        if (name === "package.json") {
          try {
            const pkg = JSON.parse(getMountContent(file));
            if (pkg.scripts) {
              let modified = false;
              for (const [key, script] of Object.entries(pkg.scripts)) {
                if (typeof script !== "string") continue;
                if (script.includes("vite") && !script.includes("--host")) {
                  pkg.scripts[key] = script.replace(/vite\b/, "vite --host 0.0.0.0");
                  modified = true;
                } else if (script.includes("next dev") && !script.includes("-H") && !script.includes("--hostname")) {
                  pkg.scripts[key] = script.replace(/next dev\b/, "next dev -H 0.0.0.0");
                  modified = true;
                } else if (script.includes("ng serve") && !script.includes("--host")) {
                  pkg.scripts[key] = script.replace(/ng serve\b/, "ng serve --host 0.0.0.0");
                  modified = true;
                } else if (script.includes("nuxt dev") && !script.includes("--host")) {
                  pkg.scripts[key] = script.replace(/nuxt dev\b/, "nuxt dev --host 0.0.0.0");
                  modified = true;
                }
              }
              if (modified) {
                fileMounts[name] = { file: { contents: JSON.stringify(pkg, null, 2) } };
                return;
              }
            }
          } catch {
            // Ignore parse errors; mount as-is
          }
        }

        fileMounts[name] = { file: { contents: getMountContent(file) } };
      });

      fileMounts[".npmrc"] = {
        file: {
          contents: [
            "registry=http://registry.npmjs.org/",
            "strict-ssl=false",
          ].join("\n"),
        },
      };

      const envFileContents = serializeEnvSecrets(envSecretsRef.current);
      if (envFileContents) {
        fileMounts[".env"] = { file: { contents: `${envFileContents}\n` } };
        fileMounts[".env.local"] = {
          file: { contents: `${envFileContents}\n` },
        };
      }

      await WebContainerManager.mountFiles(fileMounts);
    },
    [getMountContent, getWorkspacePath, workspacePrefix],
  );

  const startStaticPreviewServer = useCallback(
    async (term: RuntimeTerminal, entryPath = "index.html") => {
      const staticRoot = getStaticPreviewRoot(entryPath);
      writeRuntimeLine(
        term,
        `\r\n> node static preview server${staticRoot ? ` (${staticRoot})` : ""}\r\n`,
      );
      await spawnRuntimeProcess(
        "node",
        ["-e", STATIC_PREVIEW_SERVER_SCRIPT],
        term,
        "Static preview server",
        { cwd: staticRoot, env: RUNTIME_SERVER_ENV },
      );
    },
    [spawnRuntimeProcess, writeRuntimeLine],
  );

  const bootRuntime = useCallback(async () => {
    if (bootedRef.current) return true;

    try {
      const wc = await WebContainerManager.getInstance();
      setWebContainerBooted(true);
      bootedRef.current = true;
      await mountAll(filesRef.current);
      const currentGeneration = webContainerGenerationRef.current;
      if (serverReadyGenerationRef.current !== currentGeneration) {
        serverReadyGenerationRef.current = currentGeneration;
        wc.on("server-ready", (_port, url) => {
          if (
            serverReadyGenerationRef.current !==
            webContainerGenerationRef.current
          )
            return;
          clearPreviewTimeout();
          previewUrlRef.current = url;
          setPreviewUrl(url);
          setRunStatus("ready");
          setIsPreviewOpen(true);
        });
      }
      return true;
    } catch (error) {
      console.error("WebContainer Boot Error:", error);
      failRuntime({
        code: "WEBCONTAINER_BOOT_FAILED",
        message: "WebContainer failed to boot.",
        details: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }, [clearPreviewTimeout, failRuntime, mountAll]);

  const getReadyTerminal = useCallback(
    async (options: { required?: boolean } = {}) => {
      const required = options.required ?? true;
      let term = termRef.current;
      if (!term) {
        for (let index = 0; index < 20; index += 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (termRef.current) {
            term = termRef.current;
            break;
          }
        }
      }

      if (!term) {
        console.error("Terminal instance never materialized");
        if (required) {
          failRuntime({
            code: "TERMINAL_NOT_READY",
            message: "Terminal did not mount before runtime startup.",
          });
        }
        return null;
      }

      return term;
    },
    [failRuntime],
  );

  const ensureBooted = useCallback(
    async (term: RuntimeTerminal) => {
      let isBooted = bootedRef.current;
      if (!isBooted) {
        writeRuntimeLine(term, "\r\nWaiting for WebContainer to boot...\r\n");
        isBooted = await bootRuntime();
      }
      if (!isBooted) {
        failRuntime({
          code: "WEBCONTAINER_BOOT_FAILED",
          message: "WebContainer failed to boot in time.",
          term,
        });
        return false;
      }

      return true;
    },
    [bootRuntime, failRuntime, writeRuntimeLine],
  );

  const ensureDependenciesInstalled = useCallback(
    async (
      packageJsonFile: IDEFile,
      packageManager: PackageManager,
      term: RuntimeTerminal,
      workspaceOverride?: string | null,
    ) => {
      const installFingerprint = getInstallFingerprint(
        packageJsonFile,
        packageManager,
        workspaceOverride,
      );
      const installKeyPath = getInstallKeyPath(workspaceOverride);
      try {
        const currentFingerprint =
          await WebContainerManager.readFile(installKeyPath);
        if (currentFingerprint.trim() === installFingerprint) {
          writeRuntimeLine(
            term,
            `\r\n> Dependencies unchanged (${packageManager}); skipping install.\r\n`,
          );
          return;
        }
      } catch {
        // Missing cache key means dependencies need to be installed.
      }

      const installCommand = getInstallCommand(packageManager);
      setRunStatus("installing");
      writeRuntimeLine(
        term,
        `\r\n> ${formatCommand(installCommand)}\r\n`,
      );
      const installResult = await spawnTracked(
        installCommand.command,
        installCommand.args,
        term,
      );

      if (installResult.exitCode !== 0) {
        failRuntime({
          code: "INSTALL_FAILED",
          message: "Dependency installation failed.",
          details: `${formatCommand(installCommand)} exited with code ${installResult.exitCode}`,
          term,
        });
        throw new Error("Installation failed");
      }

      await WebContainerManager.writeFile(
        installKeyPath,
        `${installFingerprint}\n`,
      );
    },
    [
      failRuntime,
      getInstallFingerprint,
      getInstallKeyPath,
      spawnTracked,
      writeRuntimeLine,
    ],
  );

  const runSandboxRuntime = useCallback(
    async (runtimeProject: RuntimeProjectManifest, term: RuntimeTerminal) => {
      writeRuntimeLine(
        term,
        `\r\n> Server sandbox runtime selected (${runtimeProject.kind})\r\n`,
      );

      const workspaceFiles = filesRef.current
        .map((file) => {
          const name = toWorkspaceRelativePath(file.name, workspacePrefix);
          return name && isSafeWorkspacePath(name)
            ? { name, content: getMountContent(file) }
            : null;
        })
        .filter((file): file is { name: string; content: string } =>
          Boolean(file),
        );

      const response = await fetch("/api/ide/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: workspaceFiles,
          runtimeKind: runtimeProject.kind,
          entryFile: runtimeProject.entryFile
            ? toWorkspaceRelativePath(
                runtimeProject.entryFile,
                workspacePrefix,
              ) || runtimeProject.entryFile
            : undefined,
          port: 3000,
        }),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as SandboxRuntimeResponse;
      if (!response.ok) {
        const code =
          payload.code === "SANDBOX_UNAVAILABLE"
            ? "SANDBOX_UNAVAILABLE"
            : "SANDBOX_FAILED";
        failRuntime({
          code,
          message:
            payload.message ||
            `Sandbox failed to run ${runtimeProject.kind} project.`,
          details: payload.stderr || payload.stdout,
          term,
        });
        return;
      }

      if (payload.stdout) writeRuntimeLine(term, payload.stdout);
      if (payload.stderr) writeRuntimeLine(term, payload.stderr, "stderr");
      writeRuntimeLine(
        term,
        `\r\n> Sandbox started${payload.commandId ? ` (command ${payload.commandId})` : ""}.\r\n`,
      );

      if (payload.previewUrl) {
        previewUrlRef.current = payload.previewUrl;
        setPreviewUrl(payload.previewUrl);
        setRunStatus("ready");
        setIsPreviewOpen(true);
        return;
      }

      failRuntime({
        code: "NO_PREVIEW_AVAILABLE",
        message: `${runtimeProject.kind} runtime started, but no preview URL was exposed.`,
        details: payload.message,
        term,
      });
    },
    [failRuntime, getMountContent, workspacePrefix, writeRuntimeLine],
  );

  const runPackageScript = useCallback(
    async (scriptName: string, label: string) => {
      const term = await getReadyTerminal({ required: false });
      if (!(await ensureBooted(term)))
        throw new Error("WebContainer failed to boot");

      setIsRuntimeTaskRunning(true);
      try {
        await mountAll(filesRef.current, workspacePrefix);
        const runtimeProject = detectRuntimeProject(
          filesRef.current,
          workspacePrefix,
        );
        const packageJsonFile =
          runtimeProject.kind === "node"
            ? runtimeProject.packageFile
            : undefined;
        if (!packageJsonFile)
          throw new Error(
            `${label} requires a package.json in the selected workspace`,
          );

        const { scripts, error } = getPackageScripts(
          getMountContent(packageJsonFile) || "{}",
        );
        if (error) throw new Error(`package.json is invalid: ${error}`);
        if (!scripts[scriptName])
          throw new Error(`No scripts.${scriptName} found in package.json`);

        const packageManager = detectPackageManager(workspacePrefix);
        await ensureDependenciesInstalled(
          packageJsonFile,
          packageManager,
          term,
          workspacePrefix,
        );

        const scriptCommand = getScriptCommand(packageManager, scriptName);
        writeRuntimeLine(term, `\r\n> ${formatCommand(scriptCommand)}\r\n`);
        const result = await spawnTracked(
          scriptCommand.command,
          scriptCommand.args,
          term,
        );
        if (result.exitCode !== 0)
          throw new Error(`${label} failed with exit code ${result.exitCode}`);
      } finally {
        setIsRuntimeTaskRunning(false);
      }
    },
    [
      detectPackageManager,
      ensureBooted,
      ensureDependenciesInstalled,
      getMountContent,
      getReadyTerminal,
      mountAll,
      spawnTracked,
      workspacePrefix,
      writeRuntimeLine,
    ],
  );

  useEffect(() => {
    const syncFile = async () => {
      if (
        activeFileId &&
        Object.prototype.hasOwnProperty.call(fileContents, activeFileId) &&
        webContainerBooted
      ) {
        const file = files.find((item) => item.id === activeFileId);
        const filePath = file ? getWorkspacePath(file.name) : null;
        if (file && filePath) {
          try {
            await WebContainerManager.writeFile(
              filePath,
              fileContents[activeFileId],
            );
          } catch (error) {
            console.error("Failed to sync file to WC:", error);
          }
        }
      }
    };
    const timeout = setTimeout(syncFile, 500);
    return () => clearTimeout(timeout);
  }, [fileContents, activeFileId, webContainerBooted, files, getWorkspacePath]);

  const run = useCallback(async () => {
    setRunStatus("starting");
    setRuntimeError(null);
    setPreviewUrl(null);
    previewUrlRef.current = null;

    const term = await getReadyTerminal({ required: false });
    stopCurrentRuntime(term);

    try {
      const runtimeProject = detectRuntimeProject(files, workspacePrefix);
      const topLevelFolders = extractTopLevelFolders(files);
      const runnableWorkspaces = workspacePrefix === "Project"
        ? getRunnableWorkspaceCandidates(files)
        : [];

      if (workspacePrefix === "Project" && runnableWorkspaces.length > 1) {
        const choices = runnableWorkspaces
          .map((candidate) => candidate.workspace)
          .filter((value): value is string => Boolean(value));
        failRuntime({
          code: "ENTRYPOINT_NOT_FOUND",
          message: "Multiple runnable workspaces detected.",
          details: `Select one workspace before previewing: ${[...new Set(choices.length > 0 ? choices : topLevelFolders)].join(", ")}`,
          term,
        });
        return;
      }
      const packageJsonFile =
        runtimeProject.kind === "node" ? runtimeProject.packageFile : undefined;
      const staticEntryPath = STATIC_ENTRY_CANDIDATES.find((candidate) =>
        files.some(
          (file) =>
            toWorkspaceRelativePath(file.name, workspacePrefix) === candidate,
        ),
      );
      const hasStaticEntry = Boolean(staticEntryPath);

      writeRuntimeLine(
        term,
        [
          "\r\n> Runtime preflight",
          `> Workspace: ${workspacePrefix || "Project"}`,
          `> Detected: ${runtimeProject.kind}`,
          `> Entrypoint: ${runtimeProject.entryFile || staticEntryPath || "none"}`,
          `> Reason: ${runtimeProject.reason || "n/a"}\r\n`,
        ].join("\r\n"),
      );

      if (runtimeProject.requiresSandbox) {
        await runSandboxRuntime(runtimeProject, term);
        return;
      }

      if (!(await ensureBooted(term))) return;
      await mountAll(files, workspacePrefix);

      if (packageJsonFile) {
        const pkgJsonStr = getMountContent(packageJsonFile) || "{}";
        const { scripts, error } = getPackageScripts(pkgJsonStr);

        if (error) {
          writeRuntimeLine(
            term,
            `\r\n> package.json is invalid: ${error}\r\n`,
            "stderr",
          );
          if (hasStaticEntry) {
            writeRuntimeLine(
              term,
              "\r\n> Falling back to static preview because index.html exists.\r\n",
            );
            setRunStatus("starting");
            await startStaticPreviewServer(term, staticEntryPath);
            return;
          }

          failRuntime({
            code: "PACKAGE_JSON_INVALID",
            message:
              "package.json is invalid and no static index.html fallback was found.",
            details: error,
            term,
          });
          return;
        }

        const scriptName = getWebsiteScriptName(scripts);
        if (!scriptName) {
          if (hasStaticEntry && staticEntryPath) {
            writeRuntimeLine(
              term,
              "\r\n> No dev/start/preview/serve script found. Serving static website files.\r\n",
            );
            setRunStatus("starting");
            await startStaticPreviewServer(term, staticEntryPath);
            return;
          }

          failRuntime({
            code: "SCRIPT_NOT_FOUND",
            message:
              "No scripts.dev, scripts.start, scripts.preview, or scripts.serve found in package.json.",
            term,
          });
          return;
        }

        const packageManager = detectPackageManager(workspacePrefix);
        await ensureDependenciesInstalled(
          packageJsonFile,
          packageManager,
          term,
          workspacePrefix,
        );

        setRunStatus("starting");
        const scriptCommand = getScriptCommand(packageManager, scriptName);
        writeRuntimeLine(term, `\r\n> ${formatCommand(scriptCommand)}\r\n`);
        await spawnRuntimeProcess(
          scriptCommand.command,
          scriptCommand.args,
          term,
          `${scriptName} server`,
          { env: RUNTIME_SERVER_ENV },
        );
        return;
      }

      if (!hasStaticEntry) {
        writeRuntimeLine(
          term,
          "\r\n> No package.json or static website entrypoint found in the selected workspace.\r\n",
          "stderr",
        );
        if (workspacePrefix === "Project") {
          writeRuntimeLine(
            term,
            "> Select a concrete project workspace from the sidebar dropdown, then run again.\r\n",
            "stderr",
          );
        }
        failRuntime({
          code: "ENTRYPOINT_NOT_FOUND",
          message: "No runnable project entrypoint found.",
          term,
        });
        return;
      }

      setRunStatus("starting");
      await startStaticPreviewServer(term, staticEntryPath);
    } catch (error) {
      failRuntime({
        code: "UNKNOWN_RUNTIME_ERROR",
        message: "Runtime startup failed.",
        details: error instanceof Error ? error.message : String(error),
        term,
      });
    }
  }, [
    detectPackageManager,
    ensureBooted,
    ensureDependenciesInstalled,
    failRuntime,
    files,
    getMountContent,
    getReadyTerminal,
    mountAll,
    runSandboxRuntime,
    spawnRuntimeProcess,
    startStaticPreviewServer,
    stopCurrentRuntime,
    workspacePrefix,
    writeRuntimeLine,
  ]);

  const build = useCallback(async () => {
    await runPackageScript("build", "Build");
  }, [runPackageScript]);

  const test = useCallback(async () => {
    await runPackageScript("test", "Test");
  }, [runPackageScript]);

  return {
    runStatus,
    webContainerBooted,
    previewUrl,
    setPreviewUrl,
    isPreviewOpen,
    setIsPreviewOpen,
    run,
    build,
    test,
    mountAll,
    bootRuntime,
    isRuntimeTaskRunning,
    runtimeCommands,
    runtimeLogs,
    runtimeError,
  };
}
