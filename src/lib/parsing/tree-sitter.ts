import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import Go from 'tree-sitter-go';
import Rust from 'tree-sitter-rust';
import Java from 'tree-sitter-java';
import CSharp from 'tree-sitter-c-sharp';

// Map file extensions to languages
const LANGUAGE_MAP = {
  'py': Python,
  'js': JavaScript,
  'jsx': JavaScript,
  'ts': TypeScript.typescript,
  'tsx': TypeScript.tsx,
  'go': Go,
  'rs': Rust,
  'java': Java,
  'cs': CSharp,
};

export interface CodeEntity {
  type: 'function' | 'class' | 'complex_logic';
  name: string;
  code: string;
  startLine: number;
  endLine: number;
}

export async function parseCode(code: string, extension: string): Promise<CodeEntity[]> {
  const parser = new Parser();
  const language = LANGUAGE_MAP[extension as keyof typeof LANGUAGE_MAP];

  if (!language) {
    throw new Error(`Unsupported extension: ${extension}`);
  }

  // @ts-ignore
  parser.setLanguage(language);
  const tree = parser.parse(code);
  const entities: CodeEntity[] = [];

  let queryScm = '';

  if (extension === 'py') {
    queryScm = `
      (function_definition
        name: (identifier) @name
      ) @function
      (class_definition
        name: (identifier) @name
      ) @class
      (for_statement) @complex
      (while_statement) @complex
      (if_statement) @complex
    `;
  } else if (['js', 'jsx', 'ts', 'tsx'].includes(extension)) {
    queryScm = `
      (function_declaration
        name: (identifier) @name
      ) @function
      (class_declaration
        name: (identifier) @name
      ) @class
      (method_definition
        name: (property_identifier) @name
      ) @function
      (for_statement) @complex
      (while_statement) @complex
      (if_statement) @complex
    `;
  } else if (extension === 'go') {
    queryScm = `
      (function_declaration
        name: (identifier) @name
      ) @function
      (method_declaration
        name: (field_identifier) @name
      ) @function
      (for_statement) @complex
      (if_statement) @complex
    `;
  } else if (extension === 'rs') {
    queryScm = `
      (function_item
        name: (identifier) @name
      ) @function
      (impl_item
        type: (type_identifier) @name
      ) @class
      (for_expression) @complex
      (while_expression) @complex
      (if_expression) @complex
      (loop_expression) @complex
    `;
  } else if (extension === 'java') {
    queryScm = `
      (method_declaration
        name: (identifier) @name
      ) @function
      (class_declaration
        name: (identifier) @name
      ) @class
      (for_statement) @complex
      (while_statement) @complex
      (if_statement) @complex
    `;
  } else if (extension === 'cs') {
    queryScm = `
      (method_declaration
        name: (identifier) @name
      ) @function
      (class_declaration
        name: (identifier) @name
      ) @class
      (for_statement) @complex
      (while_statement) @complex
      (if_statement) @complex
    `;
  }

  if (!queryScm) return [];

  try {
    // @ts-ignore
    const query = new Parser.Query(language, queryScm);
    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      let type: CodeEntity['type'] | null = null;
      let name = 'Anonymous Block';
      let node = match.captures[0].node; // Default to first captured node

      // Identify type based on capture name
      const capture = match.captures.find(c => ['function', 'class', 'complex'].includes(c.name));
      if (capture) {
        if (capture.name === 'function') type = 'function';
        else if (capture.name === 'class') type = 'class';
        else if (capture.name === 'complex') type = 'complex_logic';
        node = capture.node;
      }

      const nameCapture = match.captures.find(c => c.name === 'name');
      if (nameCapture) {
        name = nameCapture.node.text;
      } else if (type === 'complex_logic') {
        name = `Logic Block (L${node.startPosition.row + 1})`;
      }

      if (type) {
        // Filter out small logic blocks to avoid noise
        if (type === 'complex_logic' && (node.endPosition.row - node.startPosition.row) < 5) {
          continue;
        }

        entities.push({
          type,
          name,
          code: node.text,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
        });
      }
    }
  } catch (e) {
    console.error("Query error", e);
  }

  return entities;
}
