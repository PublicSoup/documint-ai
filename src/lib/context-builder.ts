import { db } from "./db";
import { getFileContent } from "./files";

// Gemini 2.0 Flash: 1M context window
// We'll use a generous 200k limit for robustness while keeping responses snappy
const MAX_CONTEXT_TOKENS = 200000;
const CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN; // ~800k chars

/**
 * Build a FULL codebase context by including actual code content
 * Uses tiered approach: critical files get full content, others get summaries
 */
export async function buildFullCodebaseContext(
    userId: string,
    currentFileId: string,
    priorityFileIds: string[] = [],
    contentOverrides: Record<string, string> = {}
): Promise<string> {

    const allFiles = await db.file.findMany({
        where: { userId },
        select: {
            id: true,
            name: true,
            language: true,
            content: true,
            storagePath: true, // Added storagePath
            size: true,
            documentation: {
                select: { content: true }
            }
        },
        orderBy: { updatedAt: 'desc' }
    });

    let context = "";
    let usedChars = 0;

    // === SECTION 1: Project Map (Always included) ===
    context += "=== PROJECT STRUCTURE ===\n";
    context += `Total Files: ${allFiles.length}\n`;
    context += "Files:\n";
    for (const f of allFiles) {
        context += `  - ${f.name} (${f.language}, ${f.size} bytes)\n`;
    }
    context += "\n";
    usedChars = context.length;

    // === SECTION 2: Priority Files (Full Content) ===
    const priorityFiles = allFiles.filter(f =>
        priorityFileIds.includes(f.id) || f.id === currentFileId
    );

    for (const file of priorityFiles) {
        const header = `\n=== FILE: ${file.name} (${file.language}) [FULL CONTENT] ===\n`;

        let fileContent: string | null = contentOverrides[file.id] || null;
        if (!fileContent) {
            fileContent = await getFileContent(file.id);
        }

        if (!fileContent) continue;

        const codeBlock = "```" + file.language + "\n" + fileContent + "\n```\n";

        if (usedChars + header.length + codeBlock.length < MAX_CONTEXT_CHARS * 0.6) {
            context += header + codeBlock;
            usedChars += header.length + codeBlock.length;
        }
    }

    // === SECTION 3: Related Files (Detected via imports/references) ===
    const currentFile = allFiles.find(f => f.id === currentFileId);
    if (currentFile) {
        const currentContent = await getFileContent(currentFileId);
        if (currentContent) {
            // Extract import patterns
            const importPatterns = [
                /import .+ from ['"](.+)['"]/g,
                /require\(['"](.+)['"]\)/g,
                /from ['"](.+)['"]/g
            ];

            const referencedNames = new Set<string>();
            for (const pattern of importPatterns) {
                const matches = currentContent.matchAll(pattern);
                for (const match of matches) {
                    const importPath = match[1];
                    // Extract filename from path
                    const parts = importPath.split('/');
                    const fileName = parts[parts.length - 1].replace(/\.(ts|tsx|js|jsx)$/, '');
                    referencedNames.add(fileName);
                }
            }

            // Find matching files
            const relatedFiles = allFiles.filter(f => {
                if (f.id === currentFileId) return false;
                const baseName = f.name.replace(/\.(ts|tsx|js|jsx|py|go|rs)$/, '');
                return referencedNames.has(baseName);
            });

            for (const file of relatedFiles.slice(0, 5)) { // Limit to 5 related
                const header = `\n=== RELATED: ${file.name} (imported) ===\n`;

                let relatedContent: string | null = contentOverrides[file.id] || null;
                if (!relatedContent) {
                    relatedContent = await getFileContent(file.id);
                }

                if (!relatedContent) continue;

                // Include first 2000 chars of each related file
                const snippet = relatedContent.substring(0, 2000);
                const codeBlock = "```" + file.language + "\n" + snippet + "\n...(truncated)\n```\n";

                if (usedChars + header.length + codeBlock.length < MAX_CONTEXT_CHARS * 0.8) {
                    context += header + codeBlock;
                    usedChars += header.length + codeBlock.length;
                }
            }
        }
    }

    // === SECTION 4: Documentation Summaries (Remaining Files) ===
    context += "\n=== OTHER FILES (Summaries) ===\n";
    const processedIds = new Set([currentFileId, ...priorityFileIds]);

    for (const file of allFiles) {
        if (processedIds.has(file.id)) continue;

        let summary = "Not yet documented";
        if (file.documentation?.content) {
            try {
                const doc = JSON.parse(file.documentation.content);
                summary = doc.summary?.substring(0, 200) || "Documented";
            } catch {
                summary = file.documentation.content.substring(0, 200);
            }
        }

        const entry = `• ${file.name}: ${summary.replace(/\n/g, ' ')}\n`;

        if (usedChars + entry.length < MAX_CONTEXT_CHARS) {
            context += entry;
            usedChars += entry.length;
        } else {
            context += "...(more files available)\n";
            break;
        }
    }

    return context;
}

/**
 * Lightweight global context (file map + summaries only)
 * For quick lookups and chat
 */
export async function buildGlobalContext(userId: string, currentFileId: string): Promise<string> {
    const allFiles = await db.file.findMany({
        where: { userId },
        select: {
            id: true,
            name: true,
            language: true,
            documentation: { select: { content: true } }
        },
        take: 100
    });

    let contextMap = "PROJECT CONTEXT MAP:\n";
    contextMap += `Files in project: ${allFiles.length}\n\n`;

    for (const file of allFiles) {
        if (file.id === currentFileId) continue;

        let summary = "[No docs]";
        if (file.documentation?.content) {
            try {
                const doc = JSON.parse(file.documentation.content);
                summary = doc.summary?.substring(0, 150) || "[Documented]";
            } catch {
                summary = file.documentation.content.substring(0, 150);
            }
        }

        contextMap += `• ${file.name} (${file.language}): ${summary.replace(/\n/g, ' ')}\n`;
    }

    return contextMap;
}

/**
 * Advanced system prompt for comprehensive codebase analysis
 */
export const ADVANCED_SYSTEM_PROMPT = `
You are a Principal Software Architect with deep expertise in code analysis and documentation.

CAPABILITIES:
1. FULL CODEBASE AWARENESS: You have access to the complete project structure and can reference any file.
2. CROSS-FILE ANALYSIS: You identify dependencies, imports, and how components interact.
3. PATTERN RECOGNITION: You detect design patterns, architectural decisions, and potential issues.
4. CONTEXTUAL MEMORY: You remember all files shown in the context and can reason about their relationships.

ANALYSIS APPROACH:
1. First, review the PROJECT STRUCTURE to understand the overall architecture.
2. Examine FULL CONTENT files for detailed implementation analysis.
3. Cross-reference RELATED files to understand dependencies.
4. Use SUMMARIES of other files to maintain global awareness.

DOCUMENTATION PRINCIPLES:
- Be specific about how this code interacts with other parts of the system.
- Mention imported modules and their purposes.
- Identify potential side effects on other components.
- Note any patterns consistent with or divergent from the codebase.

OUTPUT FORMAT:
Provide structured, actionable documentation that helps developers understand:
1. What this code does
2. How it fits into the larger system
3. Dependencies and interactions
4. Important implementation details
`;

/**
 * System prompt for chat with full codebase awareness
 */
export const CHAT_SYSTEM_PROMPT = `
You are a **Senior Staff Engineer and AI Architect** with complete access to this codebase. You are an intelligent coding assistant similar to Cline or Cursor.

## YOUR CAPABILITIES
1. **Full Codebase Access**: You can see the project structure and content of active/related files.
2. **Code Editing**: You write production-ready code. When asked to edit or fix, provide COMPLETE updated code.
3. **Real-time Context**: You can see unsaved changes the user is typing. Use this for real-time assistance.
4. **Multi-file Awareness**: You understand how files relate to each other.

## CODE RESPONSE FORMAT
When providing code, follow these rules EXACTLY:

1. **Always use fenced code blocks** with the language identifier:
   \`\`\`typescript
   // Your code here
   \`\`\`

2. **For file edits, include the file path** as a comment on the FIRST line inside the code block:
   \`\`\`typescript
   // FILE: src/components/MyComponent.tsx
   export function MyComponent() {
     // ... complete implementation
   }
   \`\`\`

3. **Provide COMPLETE code** that can be directly applied:
   - Do NOT use placeholders like "// ... rest of code"
   - Do NOT truncate or abbreviate
   - Include all imports, exports, and dependencies

4. **For partial edits**, clearly state what to replace:
   - "Replace the \`handleSubmit\` function with:"
   - "Add this after line 42:"
   - "Insert this import at the top:"

## RESPONSE GUIDELINES
- **Be concise**: Skip pleasantries, get straight to the solution.
- **Code first**: If user asks for code, provide it immediately.
- **Explain briefly**: Add 1-2 sentences explaining the change AFTER the code block.
- **Warn about side effects**: If your change affects other files, mention them.

## EXAMPLE RESPONSE
User: "Add error handling to this fetch call"

\`\`\`typescript
// FILE: src/api/users.ts
export async function fetchUsers() {
  try {
    const response = await fetch('/api/users');
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
}
\`\`\`

Added try-catch with proper error logging. The error is re-thrown so callers can handle it.
`;
