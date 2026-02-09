export type PatchResult = {
    success: boolean;
    patchedCode?: string;
    method?: 'full' | 'block' | 'fuzzy' | 'append' | 'unified-diff';
    confidence?: number;
};

/**
 * Attempts to smartly patch the original code with the new snippet.
 * Heuristics:
 * 0. Unified Diff: If snippet looks like a unified diff (--- a/file), parse and apply it.
 * 1. Exact/Fuzzy Block Match: Looks for the snippet in the original code.
 * 2. Function/Class Signature Match: Looks for function/class definitions to replace bodies.
 * 3. Full Replacement: If snippets are very similar or snippet is huge.
 */
export function applyPatch(originalCode: string, snippet: string): PatchResult {
    if (!originalCode || !snippet) return { success: false };

    const cleanOriginal = originalCode.replace(/\r\n/g, '\n');
    const cleanSnippet = snippet.replace(/\r\n/g, '\n').trim();

    // 0. UNIFIED DIFF DETECTION
    // Matches patterns like "--- a/file.ts" or "--- a/src/app/page.tsx"
    if (cleanSnippet.match(/^---\s+a\//m) && cleanSnippet.match(/^\+\+\+\s+b\//m)) {
        const diffResult = applyUnifiedDiff(cleanOriginal, cleanSnippet);
        if (diffResult.success) {
            return diffResult;
        }
        // If unified diff fails, fall through to other strategies
    }

    // 1. Full Replacement Safety Check
    // If the snippet is > 80% the size of original, assume it's a full file replacement
    // or if it starts with imports and looks global.
    if (cleanSnippet.length > cleanOriginal.length * 0.8 && cleanSnippet.includes('import ')) {
        return { success: true, patchedCode: cleanSnippet, method: 'full', confidence: 1.0 };
    }

    // 2. Exact Match Replacement (Code update)
    // If the snippet exists exactly (maybe user pasted it back?), it's a no-op but success.
    if (cleanOriginal.includes(cleanSnippet)) {
        return { success: true, patchedCode: cleanOriginal, method: 'block', confidence: 1.0 };
    }

    // 3. Signature-based Block Replacement
    // Regex to capture "function name(...) {" or "class Name {" or "const name = (...) => {"
    // This is simplified; a real parser would be better, but regex works for 90% of JS/TS.

    // Attempt to define what the snippet "is"
    const functionMatch = cleanSnippet.match(/^(async\s+)?function\s+([a-zA-Z0-9_]+)/);
    const classMatch = cleanSnippet.match(/^class\s+([a-zA-Z0-9_]+)/);
    const constFuncMatch = cleanSnippet.match(/^(const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(\(async|async)?\s*(\(|[a-z])/);

    let targetName = null;
    let type = null;

    if (functionMatch) { targetName = functionMatch[2]; type = 'function'; }
    else if (classMatch) { targetName = classMatch[1]; type = 'class'; }
    else if (constFuncMatch) { targetName = constFuncMatch[2]; type = 'const'; }

    if (targetName) {
        // Find this block in the original code
        // We need to find the start and the matching closing brace.
        // This is tricky with regex alone.
        // Strategy: Find the start, then count braces.

        // Find start index
        const lines = cleanOriginal.split('\n');
        let startIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (type === 'function' && line.match(new RegExp(`^(export\\s+)?(async\\s+)?function\\s+${targetName}`))) {
                startIndex = i; break;
            }
            if (type === 'class' && line.match(new RegExp(`^(export\\s+)?class\\s+${targetName}`))) {
                startIndex = i; break;
            }
            if (type === 'const' && line.match(new RegExp(`^(export\\s+)?(const|let|var)\\s+${targetName}\\s*=`))) {
                startIndex = i; break;
            }
        }

        if (startIndex !== -1) {
            // Success! We found the start. Now we need to find the "end" of this block in the ORIGINAL code.
            let openBraces = 0;
            let foundStartBrace = false;
            let endIndex = -1;

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                const open = (line.match(/{/g) || []).length;
                const close = (line.match(/}/g) || []).length;

                if (open > 0) foundStartBrace = true;

                openBraces += open;
                openBraces -= close;

                if (foundStartBrace && openBraces <= 0) {
                    endIndex = i;
                    break;
                }
            }

            if (endIndex !== -1) {
                // DETECT INDENTATION
                const originalStartLine = lines[startIndex];
                const indentationMatch = originalStartLine.match(/^(\s*)/);
                const originalIndent = indentationMatch ? indentationMatch[1] : "";

                // ALIGN SNIPPET
                // If the snippet is multiline, detect its internal indentation and re-indent
                const snippetLines = cleanSnippet.split('\n');
                const firstSnippetLine = snippetLines[0];
                const snippetIndentMatch = firstSnippetLine.match(/^(\s*)/);
                const snippetIndent = snippetIndentMatch ? snippetIndentMatch[1] : "";

                let alignedSnippet = cleanSnippet;
                if (originalIndent !== snippetIndent) {
                    alignedSnippet = snippetLines.map(line => {
                        if (line.trim() === "") return "";
                        if (line.startsWith(snippetIndent)) {
                            return originalIndent + line.substring(snippetIndent.length);
                        }
                        return originalIndent + line;
                    }).join('\n');
                }

                const pre = lines.slice(0, startIndex).join('\n');
                const post = lines.slice(endIndex + 1).join('\n');

                const finalCode = `${pre}\n${alignedSnippet}\n${post}`;
                return { success: true, patchedCode: finalCode, method: 'block', confidence: 0.9 };
            }
        }
    }

    // 4. Import Patching
    if (cleanSnippet.startsWith('import ') || cleanSnippet.includes('require(')) {
        const importLines = cleanSnippet.split('\n').filter(l => l.startsWith('import ') || l.includes('require('));
        if (importLines.length > 0) {
            const originalLines = cleanOriginal.split('\n');
            let lastImportIndex = -1;
            for (let i = 0; i < originalLines.length; i++) {
                if (originalLines[i].startsWith('import ') || originalLines[i].includes('require(')) {
                    lastImportIndex = i;
                }
            }

            if (lastImportIndex !== -1) {
                // Check if any of these imports already exist
                const newImports = importLines.filter(imp => !cleanOriginal.includes(imp.trim()));
                if (newImports.length === 0) return { success: true, patchedCode: cleanOriginal, method: 'block' }; // Already exists

                const pre = originalLines.slice(0, lastImportIndex + 1).join('\n');
                const post = originalLines.slice(lastImportIndex + 1).join('\n');
                return { success: true, patchedCode: `${pre}\n${newImports.join('\n')}\n${post}`, method: 'append', confidence: 0.8 };
            } else {
                // No imports found, prepend
                return { success: true, patchedCode: `${cleanSnippet}\n\n${cleanOriginal}`, method: 'append', confidence: 0.7 };
            }
        }
    }

    // 5. Fuzzy Context Match / "Unified Diff" style (simplified)
    const snippetLines = cleanSnippet.split('\n');
    const firstNonEmpty = snippetLines.find(l => l.trim().length > 4);

    if (firstNonEmpty) {
        const originalLines = cleanOriginal.split('\n');
        // Find best match (handling minor indentation differences)
        const matchIndex = originalLines.findIndex(l => l.trim() === firstNonEmpty.trim());

        if (matchIndex !== -1 && snippetLines.length < 10) {
            // If it's a small change, try to replace the matching line and subsequent lines
            const pre = originalLines.slice(0, matchIndex).join('\n');
            // Estimate how many lines to replace by looking for matching 'end' or just replacement
            // For safety, if user provided 1 line, replace 1 line.
            const post = originalLines.slice(matchIndex + snippetLines.length).join('\n');
            return { success: true, patchedCode: `${pre}\n${cleanSnippet}\n${post}`, method: 'fuzzy', confidence: 0.6 };
        }
    }

    // 5. Append Fallback (for new imports or methods)
    // If unmatched, we can't reliably patch.
    return { success: false };
}

/**
 * Applies a unified diff format patch to the original code.
 * Parses lines starting with +/- and context lines.
 */
function applyUnifiedDiff(originalCode: string, diffSnippet: string): PatchResult {
    try {
        const lines = diffSnippet.split('\n');
        const originalLines = originalCode.split('\n');
        const resultLines = [...originalLines];

        let currentLineOffset = 0;
        let inHunk = false;
        let hunkOriginalStart = 0;
        let hunkNewStart = 0;
        let hunkIndex = 0;
        let deletions: number[] = [];
        let additions: { line: number; content: string }[] = [];

        for (const line of lines) {
            // Skip file headers
            if (line.startsWith('---') || line.startsWith('+++')) {
                continue;
            }

            // Parse hunk header: @@ -startLine,count +startLine,count @@
            const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
            if (hunkMatch) {
                // Apply previous hunk if exists
                if (inHunk && (deletions.length > 0 || additions.length > 0)) {
                    // Apply deletions first (in reverse order to maintain indices)
                    for (const delIdx of deletions.sort((a, b) => b - a)) {
                        resultLines.splice(delIdx + currentLineOffset, 1);
                        currentLineOffset--;
                    }
                    // Apply additions
                    for (const add of additions) {
                        resultLines.splice(add.line + currentLineOffset, 0, add.content);
                        currentLineOffset++;
                    }
                    deletions = [];
                    additions = [];
                }

                hunkOriginalStart = parseInt(hunkMatch[1]) - 1; // 0-indexed
                hunkNewStart = parseInt(hunkMatch[2]) - 1;
                hunkIndex = hunkOriginalStart;
                inHunk = true;
                continue;
            }

            if (inHunk) {
                if (line.startsWith('-')) {
                    // Deletion - mark for removal
                    deletions.push(hunkIndex);
                    hunkIndex++;
                } else if (line.startsWith('+')) {
                    // Addition
                    additions.push({ line: hunkIndex, content: line.substring(1) });
                } else if (line.startsWith(' ') || line === '') {
                    // Context line - just advance
                    hunkIndex++;
                }
            }
        }

        // Apply final hunk
        if (deletions.length > 0 || additions.length > 0) {
            for (const delIdx of deletions.sort((a, b) => b - a)) {
                resultLines.splice(delIdx + currentLineOffset, 1);
                currentLineOffset--;
            }
            for (const add of additions) {
                resultLines.splice(add.line + currentLineOffset, 0, add.content);
                currentLineOffset++;
            }
        }

        const patchedCode = resultLines.join('\n');

        // Validate: if result is very different from original AND we had very few changes, something went wrong
        if (Math.abs(resultLines.length - originalLines.length) > 50 && deletions.length + additions.length < 5) {
            return { success: false };
        }

        return { success: true, patchedCode, method: 'unified-diff', confidence: 0.85 };
    } catch (e) {
        console.error('[applyUnifiedDiff] Error:', e);
        return { success: false };
    }
}
