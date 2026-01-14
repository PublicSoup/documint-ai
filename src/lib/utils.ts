import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface CodeBlock {
    id: string;
    language: string;
    code: string;
    fileName?: string;
    applied: boolean;
    timestamp: number;
    startIndex?: number;
    endIndex?: number;
}

export function extractCodeBlocks(text: string): CodeBlock[] {
    // Match code blocks with optional language and file path: ```typescript:path/to/file.ts
    // Also match standard format: ```typescript
    const codeBlockRegex = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
    const blocks: CodeBlock[] = [];
    let match;
    let index = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
        let language = match[1] || "plaintext";
        let fileName = match[2] ? match[2].trim() : undefined;
        let code = match[3];

        // Remove FILE: annotation from code if present (handles multiple formats)
        const fileMatch = code.match(/^(?:\/\/|#)\s*FILE:\s*(.+?)(?:[\r\n]|$)/im);
        if (fileMatch) {
            fileName = fileMatch[1].trim();
            // Remove the FILE: comment line from the code
            code = code.replace(fileMatch[0], "").trim();
        }

        // Also check for FILE: in the first few lines (in case of formatting)
        if (!fileName) {
            const lines = code.split('\n').slice(0, 3);
            for (const line of lines) {
                const lineMatch = line.match(/^(?:\/\/|#)\s*FILE:\s*(.+?)$/i);
                if (lineMatch) {
                    fileName = lineMatch[1].trim();
                    code = code.replace(line, "").trim();
                    break;
                }
            }
        }

        blocks.push({
            id: `block-${Date.now()}-${index++}`,
            language,
            code,
            fileName,
            applied: false,
            timestamp: Date.now(),
            startIndex: match.index,
            endIndex: match.index + match[0].length
        });
    }

    // Fallback: If no blocks found but backticks exist, try simpler regex
    if (blocks.length === 0 && text.includes("```")) {
        const simpleRegex = /```([\s\S]*?)```/g;
        let simpleMatch;
        while ((simpleMatch = simpleRegex.exec(text)) !== null) {
            const fullBlock = simpleMatch[1];
            const lines = fullBlock.split('\n');
            let language = "plaintext";
            let code = fullBlock;
            let fileName: string | undefined;

            // Check first line for language
            if (lines.length > 0) {
                const firstLine = lines[0].trim();
                if (firstLine.length < 30 && !firstLine.includes(' ')) {
                    language = firstLine;
                    code = lines.slice(1).join('\n');
                }
            }

            // Check for FILE: annotation
            const fileMatch = code.match(/^(?:\/\/|#)\s*FILE:\s*(.+?)(?:[\r\n]|$)/im);
            if (fileMatch) {
                fileName = fileMatch[1].trim();
                code = code.replace(fileMatch[0], "").trim();
            }

            blocks.push({
                id: `block-${Date.now()}-${index++}`,
                language,
                code: code.trim(),
                fileName,
                applied: false,
                timestamp: Date.now(),
                startIndex: simpleMatch.index,
                endIndex: simpleMatch.index + simpleMatch[0].length
            });
        }
    }

    return blocks;
}

export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
    if (!json) return fallback;
    try {
        return JSON.parse(json);
    } catch {
        return fallback;
    }
}
