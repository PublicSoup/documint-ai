/// Mirrors the response of POST /api/ide/sandbox/run — either a `wait`
/// command (stdout/stderr) or a `detached` server command (previewUrl).
class SandboxRunResult {
  final String? sandboxId;
  final String? stdout;
  final String? stderr;
  final String? previewUrl;
  final String? message;

  const SandboxRunResult({this.sandboxId, this.stdout, this.stderr, this.previewUrl, this.message});

  factory SandboxRunResult.fromJson(Map<String, dynamic> json) => SandboxRunResult(
        sandboxId: json['sandboxId'] as String?,
        stdout: json['stdout'] as String?,
        stderr: json['stderr'] as String?,
        previewUrl: json['previewUrl'] as String?,
        message: json['message'] as String?,
      );

  bool get hasPreview => previewUrl != null && previewUrl!.isNotEmpty;
  bool get hasOutput => (stdout?.isNotEmpty ?? false) || (stderr?.isNotEmpty ?? false);
}
