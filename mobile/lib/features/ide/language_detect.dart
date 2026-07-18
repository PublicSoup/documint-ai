/// Mirrors `detectLanguage()` in src/app/api/files/[fileId]/route.ts so the
/// editor picks the same Monaco language id the backend would assign.
String detectMonacoLanguage(String fileName) {
  final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : '';

  const map = {
    'ts': 'typescript', 'tsx': 'typescript',
    'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
    'css': 'css', 'scss': 'scss', 'less': 'less',
    'html': 'html', 'htm': 'html',
    'json': 'json', 'jsonc': 'json',
    'md': 'markdown', 'mdx': 'markdown',
    'py': 'python',
    'rb': 'ruby',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'c': 'c', 'h': 'c',
    'cpp': 'cpp', 'hpp': 'cpp', 'cc': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'sql': 'sql',
    'sh': 'shell', 'bash': 'shell', 'zsh': 'shell',
    'yaml': 'yaml', 'yml': 'yaml',
    'xml': 'xml', 'svg': 'xml',
    'graphql': 'graphql', 'gql': 'graphql',
    'dockerfile': 'dockerfile',
    'toml': 'ini',
    'ini': 'ini',
    'dart': 'plaintext', // no bundled Dart grammar in Monaco's default set
  };

  return map[ext] ?? 'plaintext';
}
