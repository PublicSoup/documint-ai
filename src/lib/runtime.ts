export interface RuntimeConfig {
  canExecuteCommands: boolean;
  canWriteLocalFiles: boolean;
  canUseSandbox: boolean;
  runtimeName: string;
}

// In a real edge environment (like Cloudflare Workers), certain Node APIs
// are disabled. We determine this by checking an environment variable
// or detecting the absence of Node.js globals.
// @ts-ignore - process.versions might not exist in Edge
const isEdge = process.env.NEXT_RUNTIME === 'edge' || typeof process !== 'object' || (typeof process === 'object' && !process.versions?.node);

export const currentRuntime: RuntimeConfig = {
  canExecuteCommands: !isEdge && process.env.NODE_ENV !== 'production', // Disable in CF production
  canWriteLocalFiles: !isEdge, // Read-only file system on CF Workers
  canUseSandbox: !isEdge && process.env.NODE_ENV !== 'production' && !process.env.CF_PAGES, // Vercel sandbox is not supported on CF
  runtimeName: isEdge ? 'cloudflare-workers' : 'node',
};
