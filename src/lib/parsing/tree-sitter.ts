// Simplified code parsing without tree-sitter bindings issues
// This uses regex-based parsing which is simpler and more reliable

export interface CodeEntity {
  type: 'function' | 'class' | 'complex_logic';
  name: string;
  code: string;
  startLine: number;
  endLine: number;
}

// Language-specific parsing patterns
const PATTERNS = {
  python: {
    function: /^\s*(?:async\s+)?def\s+(\w+)\s*\([^)]*\)[\s\n]*:/gm,
    class: /^\s*class\s+(\w+)(?:\s*\(\s*[^)]*\s*\))?\s*:/gm,
    complex: /(?:for\s+|while\s+|if\s+|with\s+|try\s*:)/gm,
    block_start: /:\s*(?:#.*)?$/m
  },
  javascript: {
    function: /(?:function\s+(\w+)|(?:(?:const|let|var)\s+)?(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:async\s+)?(\w+)\s*\([^)]*\)\s*{)/gm,
    class: /^class\s+(\w+)(?:\s+extends\s+\w+)?\s*{/gm,
    complex: /(?:for\s*\(|while\s*\(|if\s*\(|switch\s*\()/gm,
    block_start: /\{\s*(?:\/\/.*)?$|\)\s*\{/m
  },
  typescript: {
    function: /(?:function\s+(\w+)|(?:(?:const|let|var)\s+)?(\w+)\s*:\s*.*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:async\s+)?(\w+)\s*\([^)]*\)\s*{)/gm,
    class: /^class\s+(\w+)(?:\s+extends\s+\w+)?\s*{/gm,
    complex: /(?:for\s*\(|while\s*\(|if\s*\(|switch\s*\()/gm,
    block_start: /\{\s*(?:\/\/.*)?$|\)\s*\{/m
  },
  go: {
    function: /^func\s+(?:\w+\s+)*(\w+)\s*\([^)]*\)/gm,
    method: /^func\s*\(\s*\*\s*\w+\s*\)\s*(\w+)\s*\([^)]*\)/gm,
    complex: /(?:for\s+|if\s+|switch\s+|case\s+)/gm,
    block_start: /\{\s*(?:\/\/.*)?$/
  },
  java: {
    function: /(?:public|private|protected)?\s+(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*{/gm,
    class: /^class\s+(\w+)/gm,
    complex: /(?:for\s*\(|while\s*\(|if\s*\(|switch\s*\()/gm,
    block_start: /\{\s*(?:\/\/.*)?$/
  },
  csharp: {
    function: /(?:public|private|protected)?\s+(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*{/gm,
    class: /^class\s+(\w+)/gm,
    complex: /(?:for\s*\(|while\s*\(|if\s*\(|switch\s*\()/gm,
    block_start: /\{\s*(?:\/\/.*)?$/
  },
  rust: {
    function: /^fn\s+(\w+)\s*\([^)]*\)/gm,
    method: /^impl\s+\w+\s*{\s*.*fn\s+(\w+)\s*\([^)]*\)/gm,
    complex: /(?:for\s+|while\s+|if\s+|match\s+)/gm,
    block_start: /\{\s*(?:\/\/.*)?$/
  }
};

export async function parseCode(code: string, extension: string): Promise<CodeEntity[]> {
  const entities: CodeEntity[] = [];
  const lines = code.split('\n');
  const patterns = PATTERNS[extension as keyof typeof PATTERNS];

  if (!patterns) {
    return entities; // Skip unsupported languages
  }

  // Find functions and classes
  for (const [type, pattern] of Object.entries(patterns)) {
    if (type === 'complex' || type === 'block_start') continue;

    const matches = code.matchAll(pattern);

    for (const match of matches) {
      const name = match[1] || match[2] || match[3] || 'anonymous';
      const startPos = match.index || 0;
      const startLine = code.substring(0, startPos).split('\n').length;

      // Find the end of the function/class
      let endLine = startLine;
      let braceCount = 0;
      let inBlock = false;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];

        if (!inBlock) {
          // Look for opening brace
          if (line.includes('{') || line.match(patterns.block_start)) {
            braceCount = 1;
            inBlock = true;
            continue;
          }
        }

        if (inBlock) {
          const openBraces = (line.match(/{/g) || []).length;
          const closeBraces = (line.match(/}/g) || []).length;
          braceCount += openBraces - closeBraces;

          if (braceCount <= 0) {
            endLine = i + 1;
            break;
          }
        }

        // For languages without braces (Python)
        if (!inBlock && i > startLine) {
          // Look for dedentation
          const currentIndent = line.match(/^\s*/)?.[0].length || 0;
          const startIndent = lines[startLine - 1].match(/^\s*/)?.[0].length || 0;
          if (currentIndent <= startIndent) {
            endLine = i;
            break;
          }
        }
      }

      if (endLine > startLine) {
        entities.push({
          type: type as CodeEntity['type'],
          name,
          code: lines.slice(startLine - 1, endLine).join('\n'),
          startLine,
          endLine
        });
      }
    }
  }

  // Find complex logic blocks
  const complexMatches = code.matchAll(patterns.complex);

  for (const match of complexMatches) {
    const startPos = match.index || 0;
    const startLine = code.substring(0, startPos).split('\n').length;

    // Simple logic block detection - find next empty line or major structure change
    let endLine = startLine;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '' || line.match(/^(?:function|class|def|fn|if|else|for|while)/)) {
        endLine = i;
        break;
      }
      // Also check for significant indentation changes
      if (i > startLine) {
        const currentIndent = lines[i].match(/^\s*/)?.[0].length || 0;
        const prevIndent = lines[startLine - 1].match(/^\s*/)?.[0].length || 0;
        if (currentIndent < prevIndent) {
          endLine = i;
          break;
        }
      }
    }

    if (endLine > startLine) {
      entities.push({
        type: 'complex_logic',
        name: `Complex Logic (L${startLine})`,
        code: lines.slice(startLine - 1, Math.min(endLine + 3, lines.length)).join('\n'),
        startLine,
        endLine: Math.min(endLine + 3, lines.length)
      });
    }
  }

  return entities;
}
