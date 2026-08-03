/// Maps a file name to the sandbox `runtimeKind` the backend accepts, or
/// null if the language can't be run via /api/ide/sandbox/run on mobile.
///
/// Mirrors the sandbox-supported subset of the web's `detectRuntimeProject`
/// (src/components/ide/shared/ide-constants.ts): JS/TS/Node and static HTML
/// are intentionally excluded — those run only through the browser-only
/// WebContainer on web and the endpoint's enum rejects them.
String? detectRuntimeKind(String fileName) {
  final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : '';
  switch (ext) {
    case 'py':
      return 'python';
    case 'php':
      return 'php';
    case 'go':
      return 'go';
    case 'java':
      return 'java';
    case 'rs':
      return 'rust';
    case 'sh':
    case 'bash':
      return 'shell';
    default:
      return null;
  }
}

/// Human-readable label for a runtimeKind, for UI messaging.
String runtimeLabel(String kind) {
  switch (kind) {
    case 'python':
      return 'Python';
    case 'php':
      return 'PHP';
    case 'go':
      return 'Go';
    case 'java':
      return 'Java';
    case 'rust':
      return 'Rust';
    case 'shell':
      return 'Shell';
    default:
      return kind;
  }
}
