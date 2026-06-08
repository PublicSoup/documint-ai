export interface CodeBlock {
    id: string;
    language: string;
    code: string;
    fileName?: string; // Extracted from "// FILE: path/to/file.ts"
    applied: boolean;
    timestamp: number;
    startIndex?: number;
    endIndex?: number;
}

export interface ThoughtStep {
    id: string;
    type: 'thought' | 'tool_call' | 'tool_result' | 'error' | 'command' | 'preview' | 'error_report';
    content: string;
    toolName?: string;
    timestamp: number;
}

export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    codeBlocks: CodeBlock[];
    thoughtSteps?: ThoughtStep[];
    timestamp: number;
}

export interface PendingChange {
    id: string;
    fileId: string;
    originalContent: string;
    newContent: string;
    applied: boolean;
    canUndo: boolean;
    timestamp: number;
}
