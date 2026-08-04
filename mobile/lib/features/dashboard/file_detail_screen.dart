import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/api_exception.dart';
import '../../api/models/documentation.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';
import '../../api/data_providers.dart';
import '../../widgets/web_view_screen.dart';
import '../diagrams/diagram_screen.dart';

class FileDetailScreen extends ConsumerWidget {
  const FileDetailScreen({super.key, required this.fileId});

  final String fileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The file name isn't part of this route's params, so pull it from the
    // already-cached file list rather than making an extra request.
    final fileName = ref.watch(filesListProvider).valueOrNull?.where((f) => f.id == fileId).firstOrNull?.name;

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(fileName ?? 'File', overflow: TextOverflow.ellipsis),
          actions: [
            IconButton(
              icon: const Icon(Icons.account_tree_outlined),
              tooltip: 'Diagram',
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => DiagramScreen(fileId: fileId, fileName: fileName)),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.ios_share),
              tooltip: 'Share',
              onPressed: () => _share(context, ref),
            ),
          ],
          bottom: const TabBar(tabs: [Tab(text: 'Code'), Tab(text: 'Documentation')]),
        ),
        body: TabBarView(
          children: [
            _CodeTab(fileId: fileId),
            _DocsTab(fileId: fileId),
          ],
        ),
      ),
    );
  }

  /// Publishes the file's documentation and offers the resulting public link.
  Future<void> _share(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    String url;
    try {
      url = await ref.read(docsRepositoryProvider).setPublicShare(fileId, isPublic: true);
    } catch (e) {
      final message = e is ApiException
          ? (e.statusCode == 400 ? 'Generate documentation for this file first.' : e.message)
          : 'Could not create a share link.';
      messenger.showSnackBar(SnackBar(content: Text(message)));
      return;
    }

    if (!context.mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Public link'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Anyone with this link can view this documentation.'),
            const SizedBox(height: 12),
            SelectableText(url, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ref.read(docsRepositoryProvider).setPublicShare(fileId, isPublic: false);
                messenger.showSnackBar(const SnackBar(content: Text('Sharing disabled.')));
              } catch (_) {
                messenger.showSnackBar(const SnackBar(content: Text('Could not disable sharing.')));
              }
            },
            style: TextButton.styleFrom(foregroundColor: AppColors.destructive),
            child: const Text('Make private'),
          ),
          TextButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: url));
              Navigator.pop(ctx);
              messenger.showSnackBar(const SnackBar(content: Text('Link copied.')));
            },
            child: const Text('Copy'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              navigator.push(MaterialPageRoute(builder: (_) => WebViewScreen(url: url, title: 'Shared doc')));
            },
            child: const Text('Open'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Share.share(url, subject: 'DocuMint AI documentation');
            },
            child: const Text('Share…'),
          ),
        ],
      ),
    );
  }
}

class _CodeTab extends ConsumerWidget {
  const _CodeTab({required this.fileId});
  final String fileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contentAsync = ref.watch(fileContentProvider(fileId));

    return contentAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) {
        final isPaymentRequired = error is ApiException && error.isPaymentRequired;
        return _CenteredMessage(
          text: isPaymentRequired
              ? 'Viewing source code requires a Pro plan. Upgrade from the web app to unlock this.'
              : (error is ApiException ? error.message : 'Failed to load file content.'),
        );
      },
      data: (content) => SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: SelectableText(content, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
      ),
    );
  }
}

const Map<String, Color> _statusColor = {
  'DRAFT': AppColors.mutedForeground,
  'REVIEW': AppColors.warning,
  'APPROVED': AppColors.success,
};

class _DocsTab extends ConsumerWidget {
  const _DocsTab({required this.fileId});
  final String fileId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docAsync = ref.watch(documentationProvider(fileId));

    return docAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, stack) => _CenteredMessage(text: error is ApiException ? error.message : 'Failed to load documentation.'),
      data: (doc) {
        if (doc == null) {
          return _NoDocumentation(fileId: fileId);
        }
        return _DocumentationView(fileId: fileId, doc: doc);
      },
    );
  }
}

class _NoDocumentation extends ConsumerStatefulWidget {
  const _NoDocumentation({required this.fileId});
  final String fileId;

  @override
  ConsumerState<_NoDocumentation> createState() => _NoDocumentationState();
}

class _NoDocumentationState extends ConsumerState<_NoDocumentation> {
  bool _isGenerating = false;
  String? _error;

  Future<void> _generate() async {
    setState(() {
      _isGenerating = true;
      _error = null;
    });
    try {
      await ref.read(docsRepositoryProvider).generateDocumentation(widget.fileId);
      ref.invalidate(documentationProvider(widget.fileId));
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Failed to generate documentation.');
    } finally {
      if (mounted) setState(() => _isGenerating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('No documentation has been generated for this file yet.', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _isGenerating ? null : _generate,
              child: _isGenerating
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primaryForeground))
                  : const Text('Generate Documentation'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.destructive), textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }
}

class _DocumentationView extends ConsumerStatefulWidget {
  const _DocumentationView({required this.fileId, required this.doc});
  final String fileId;
  final Documentation doc;

  @override
  ConsumerState<_DocumentationView> createState() => _DocumentationViewState();
}

class _DocumentationViewState extends ConsumerState<_DocumentationView> {
  bool _isRegenerating = false;

  Future<void> _regenerate() async {
    setState(() => _isRegenerating = true);
    try {
      await ref.read(docsRepositoryProvider).generateDocumentation(widget.fileId, force: true);
      ref.invalidate(documentationProvider(widget.fileId));
    } catch (_) {
      // Surfaced implicitly via the refreshed provider's error state on retry.
    } finally {
      if (mounted) setState(() => _isRegenerating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final doc = widget.doc;
    final color = _statusColor[doc.status] ?? AppColors.mutedForeground;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: color.withValues(alpha: 0.4)),
                    ),
                    child: Text(doc.status, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                  const Spacer(),
                  OutlinedButton(
                    onPressed: _isRegenerating ? null : _regenerate,
                    child: _isRegenerating
                        ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Regenerate'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          SelectableText(doc.content, style: const TextStyle(fontSize: 15, height: 1.5)),
        ],
      ),
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(text, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
      ),
    );
  }
}
