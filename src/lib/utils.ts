import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

/**
 * Extracts code blocks from markdown-formatted AI responses
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
  const codeBlockRegex = /```(\w+)?(?:\s+(.+?))?\n([\s\S]*?)```/g;
  const blocks: CodeBlock[] = [];
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      filename: match[2]?.trim(),
      code: match[3].trim(),
    });
  }

  return blocks;
}

/**
 * Safely parse JSON with fallback to default value
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}
