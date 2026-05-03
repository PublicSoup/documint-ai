/**
 * Utility functions for code generation and application.
 * Extracted from ai-chat-panel.tsx
 */

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

/**
 * Smart code application: Tries to apply only the relevant code block instead of replacing entire file
 * This is Cline-like behavior - intelligent patching instead of full replacement
 */
export const applyCodeBlock = (originalContent: string, newCode: string): string => {
    if (!originalContent || originalContent.trim() === "") {
        // Empty file, just use the new code
        return newCode;
    }

    const originalLines = originalContent.split('\n');
    const newLines = newCode.split('\n');
    const originalSize = originalContent.length;
    const newSize = newCode.length;

    // If new code is very similar in size to original (>90% match), it's likely a full replacement
    const sizeRatio = Math.min(originalSize, newSize) / Math.max(originalSize, newSize);
    if (sizeRatio > 0.9 && newSize > originalSize * 0.8) {
        return newCode;
    }

    // Strategy 1: Try to find and replace specific function/class by name
    const functionMatch = newCode.match(/(?:function|const|let|var|export\s+(?:const|function|default))\s+(\w+)\s*[=\(]/);
    const classMatch = newCode.match(/class\s+(\w+)/);
    const exportClassMatch = newCode.match(/export\s+class\s+(\w+)/);

    const targetName = functionMatch?.[1] || classMatch?.[1] || exportClassMatch?.[1];

    if (targetName) {
        // Try to find the function/class in the original file and replace just that block
        let startIdx = -1;
        let endIdx = -1;
        let braceCount = 0;
        let inTarget = false;

        for (let i = 0; i < originalLines.length; i++) {
            const line = originalLines[i];

            // Check if this line starts the target function/class
            if ((line.includes(`function ${targetName}`) ||
                line.includes(`const ${targetName}`) ||
                line.includes(`let ${targetName}`) ||
                line.includes(`var ${targetName}`) ||
                line.includes(`class ${targetName}`) ||
                line.includes(`export class ${targetName}`) ||
                line.includes(`export function ${targetName}`) ||
                line.includes(`export const ${targetName}`)) && startIdx === -1) {
                startIdx = i;
                inTarget = true;
            }

            if (inTarget) {
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;

                // If we've closed all braces and we're past the start, we found the end
                if (braceCount === 0 && startIdx !== -1 && i > startIdx) {
                    endIdx = i + 1;
                    break;
                }
            }
        }

        if (startIdx !== -1 && endIdx !== -1) {
            // Found the target block, replace it
            const before = originalLines.slice(0, startIdx).join('\n');
            const after = originalLines.slice(endIdx).join('\n');
            const result = (before + '\n' + newCode.trim() + '\n' + after).trim();
            return result;
        }
    }

    // Strategy 2: If new code is much smaller, try to find matching context
    if (newLines.length < originalLines.length * 0.4) {
        // Look for lines that match the beginning of the new code
        const newCodeStart = newLines[0]?.trim().substring(0, 30) || '';

        for (let i = 0; i < originalLines.length; i++) {
            const line = originalLines[i];
            if (line.trim().substring(0, 30) === newCodeStart ||
                (newCodeStart.length > 10 && line.includes(newCodeStart))) {
                // Found a match, try to replace from here
                let endIdx = i + 1;
                let braceCount = 0;
                let foundStart = false;

                for (let j = i; j < originalLines.length; j++) {
                    const currentLine = originalLines[j];
                    braceCount += (currentLine.match(/\{/g) || []).length;
                    braceCount -= (currentLine.match(/\}/g) || []).length;

                    if (braceCount > 0) foundStart = true;
                    if (foundStart && braceCount === 0 && j > i) {
                        endIdx = j + 1;
                        break;
                    }
                }

                // Replace the identified block
                const before = originalLines.slice(0, i).join('\n');
                const after = originalLines.slice(endIdx).join('\n');
                return (before + '\n' + newCode.trim() + '\n' + after).trim();
            }
        }
    }

    // Strategy 3: Check if new code looks like a complete file (has imports/exports at top)
    const hasTopLevelImports = /^(import|export|from|require)/m.test(newCode.trim());
    const functionCount = (newCode.match(/(?:function|const|let|var)\s+\w+\s*[=\(]/g) || []).length;
    const classCount = (newCode.match(/class\s+\w+/g) || []).length;

    // If it has imports at top AND multiple functions/classes, it's likely a full file
    if (hasTopLevelImports && (functionCount > 1 || classCount > 0)) {
        return newCode;
    }

    // Strategy 4: If new code is very small (< 10% of original), append it
    if (newSize < originalSize * 0.1 && newLines.length < 10) {
        return originalContent + '\n\n' + newCode;
    }

    // Default: If we can't intelligently patch, replace the entire file
    // This is safer than guessing wrong
    return newCode;
};
