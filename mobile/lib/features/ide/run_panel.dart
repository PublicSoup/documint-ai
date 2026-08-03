import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/models/sandbox_run_result.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/web_view_screen.dart';
import 'runtime_detect.dart';

/// Bottom sheet that runs the current file via the Vercel Sandbox and shows
/// stdout/stderr and/or an "Open preview" button. Opened from the editor's
/// Run action. Kept self-contained so the run lifecycle is easy to reason about.
Future<void> showRunPanel(
  BuildContext context,
  WidgetRef ref, {
  required String fileName,
  required String content,
  required String runtimeKind,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.ideElevated,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (_) => _RunSheet(fileName: fileName, content: content, runtimeKind: runtimeKind, repoRef: ref),
  );
}

class _RunSheet extends StatefulWidget {
  const _RunSheet({required this.fileName, required this.content, required this.runtimeKind, required this.repoRef});
  final String fileName;
  final String content;
  final String runtimeKind;
  final WidgetRef repoRef;

  @override
  State<_RunSheet> createState() => _RunSheetState();
}

class _RunSheetState extends State<_RunSheet> {
  bool _loading = true;
  String? _error;
  SandboxRunResult? _result;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    setState(() { _loading = true; _error = null; _result = null; });
    try {
      final result = await widget.repoRef.read(sandboxRepositoryProvider).run(
            fileName: widget.fileName,
            content: widget.content,
            runtimeKind: widget.runtimeKind,
          );
      if (mounted) setState(() { _result = result; _loading = false; });
    } catch (e) {
      if (mounted) {
        setState(() {
          if (e is ApiException && e.statusCode == 503) {
            _error = 'The code sandbox is not available on this server right now.';
          } else {
            _error = e is ApiException ? e.message : 'Run failed. Please try again.';
          }
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 0.92,
      builder: (context, scrollController) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.play_circle_outline, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(child: Text('Run · ${runtimeLabel(widget.runtimeKind)}', style: Theme.of(context).textTheme.titleMedium)),
                if (!_loading)
                  IconButton(icon: const Icon(Icons.refresh), onPressed: _run, tooltip: 'Re-run'),
              ],
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(),
                          SizedBox(height: 12),
                          Text('Running in a sandbox…'),
                        ],
                      ),
                    )
                  : _error != null
                      ? Center(child: Text(_error!, style: const TextStyle(color: AppColors.destructive), textAlign: TextAlign.center))
                      : _ResultView(result: _result!, scrollController: scrollController),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView({required this.result, required this.scrollController});
  final SandboxRunResult result;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: scrollController,
      children: [
        if (result.hasPreview)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ElevatedButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => WebViewScreen(url: result.previewUrl!, title: 'Preview')),
              ),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('Open live preview'),
            ),
          ),
        if (result.hasOutput) ...[
          if ((result.stdout ?? '').isNotEmpty) _OutputBlock(label: 'stdout', text: result.stdout!, color: AppColors.foreground),
          if ((result.stderr ?? '').isNotEmpty) _OutputBlock(label: 'stderr', text: result.stderr!, color: AppColors.warning),
        ] else if (!result.hasPreview)
          Text(result.message ?? 'Command finished with no output.', style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _OutputBlock extends StatelessWidget {
  const _OutputBlock({required this.label, required this.text, required this.color});
  final String label;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.ideBackground,
        borderRadius: BorderRadius.circular(AppRadius.sm),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.mutedForeground, fontSize: 11, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          SelectableText(text, style: TextStyle(fontFamily: 'monospace', fontSize: 13, height: 1.4, color: color)),
        ],
      ),
    );
  }
}
