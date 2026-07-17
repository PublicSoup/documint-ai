import type { File as PrismaFile } from "@prisma/client";

export type IDEFile = Omit<PrismaFile, "createdAt" | "updatedAt"> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  content?: string | null;
};
export type IDEFileWithDocumentation = IDEFile & { documentation?: unknown };
export type IDEFileContentMap = Record<string, string>;
export type IDEUnsavedMap = Record<string, boolean>;

export type SidebarTab = "explorer" | "search" | "git";

export type FileAction =
  | "ai"
  | "document"
  | "delete"
  | "delete_project"
  | "rename"
  | "new_file"
  | "new_folder";

export type IDELanguage =
  | "typescript"
  | "typescriptreact"
  | "javascript"
  | "javascriptreact"
  | "json"
  | "css"
  | "scss"
  | "less"
  | "html"
  | "markdown"
  | "python"
  | "ruby"
  | "rust"
  | "go"
  | "java"
  | "c"
  | "cpp"
  | "csharp"
  | "php"
  | "sql"
  | "shell"
  | "yaml"
  | "xml"
  | "graphql"
  | "dockerfile"
  | "ini"
  | "plaintext";

export interface IDEUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface SubscriptionUsage {
  tokens?: number;
}

export interface SubscriptionLimits {
  totalFiles?: number;
  maxTokens?: number;
}

export interface SubscriptionInfo {
  plan?: string;
  usage?: SubscriptionUsage;
  limits?: SubscriptionLimits;
}

export interface GitStatusFile {
  path: string;
  status: "M" | "A" | "D" | "R" | "C" | "??" | string;
}

export interface ParsedGitStatus {
  branch: string;
  dirty: boolean;
  files: GitStatusFile[];
}

export interface Secret {
  key: string;
  value: string;
}

export type RuntimeKind =
  | "node"
  | "static"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "php"
  | "shell"
  | "docker"
  | "unknown";

export type RuntimeErrorCode =
  | "TERMINAL_NOT_READY"
  | "WEBCONTAINER_BOOT_FAILED"
  | "INSTALL_FAILED"
  | "PACKAGE_JSON_INVALID"
  | "SCRIPT_NOT_FOUND"
  | "ENTRYPOINT_NOT_FOUND"
  | "SERVER_READY_TIMEOUT"
  | "SERVER_EXITED"
  | "UNSUPPORTED_BROWSER_RUNTIME"
  | "SANDBOX_UNAVAILABLE"
  | "SANDBOX_FAILED"
  | "NO_PREVIEW_AVAILABLE"
  | "UNKNOWN_RUNTIME_ERROR";

export interface RuntimeErrorInfo {
  code: RuntimeErrorCode;
  message: string;
  hint: string;
  details?: string;
}

export interface RuntimeProjectManifest {
  kind: RuntimeKind;
  workspace?: string;
  entryFile?: string;
  packageFile?: IDEFile;
  cargoFile?: IDEFile;
  previewableInBrowser?: boolean;
  requiresSandbox?: boolean;
  reason?: string;
}
