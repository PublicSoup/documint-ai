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
    let filename = match[2]?.trim();

    if (filename) {
      filename = filename
        .replace(/^\/\/\s*/, '')
        .replace(/^\/\*\s*/, '')
        .replace(/\*\/\s*$/, '')
        .replace(/^#\s*/, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .trim();

      if (filename && !/^[a-zA-Z0-9@._\-\/]+\.[a-zA-Z0-9]+$/.test(filename)) {
        filename = '';
      }
    }

    blocks.push({
      language: match[1] || 'text',
      filename: filename || '',
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

/**
 * Reads a ReadableStream of strings to a single string.
 * @param stream The readable stream to read.
 * @returns A promise that resolves to the string content of the stream.
 */
export async function streamToString(stream: ReadableStream<string>): Promise<string> {
    const reader = stream.getReader();
    let result = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        result += value;
    }
    return result;
}
