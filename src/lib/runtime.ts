export interface RuntimeConfig {
  canExecuteCommands: boolean;
  canWriteLocalFiles: boolean;
  canUseSandbox: boolean;
  runtimeName: string;
}

const isVercel = !!process.env.VERCEL;

export const currentRuntime: RuntimeConfig = {
  canExecuteCommands: process.env.NODE_ENV === 'development', 
  canWriteLocalFiles: process.env.NODE_ENV !== 'production', 
  canUseSandbox: isVercel && process.env.NODE_ENV === 'production', 
  runtimeName: isVercel ? 'vercel' : 'node',
};
