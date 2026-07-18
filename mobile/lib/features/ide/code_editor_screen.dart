import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';
import 'language_detect.dart';
import 'monaco_webview.dart';

class CodeEditorScreen extends ConsumerStatefulWidget {
  const CodeEditorScreen({super.key, required this.fileId, this.fileName});

  final String fileId;
  final String? fileName;

  @override
  ConsumerState<CodeEditorScreen> createState() => _CodeEditorScreenState();
}

class _CodeEditorScreenState extends ConsumerState<CodeEditorScreen> {
  String? _pendingContent;
  bool _isSaving = false;
  String? _saveError;

  bool get _isDirty => _pendingContent != null;

  Future<void> _save(String baseline) async {
    if (_pendingContent == null) return;
    setState(() {
      _isSaving = true;
      _saveError = null;
    });

    try {
      await ref.read(filesRepositoryProvider).updateFileContent(widget.fileId, _pendingContent!);
      ref.invalidate(fileContentProvider(widget.fileId));
      ref.invalidate(filesListProvider);
      setState(() => _pendingContent = null);
    } catch (e) {
      setState(() => _saveError = e is ApiException ? e.message : 'Failed to save file.');
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contentAsync = ref.watch(fileContentProvider(widget.fileId));
    final language = detectMonacoLanguage(widget.fileName ?? '');

    return Scaffold(
      backgroundColor: AppColors.ideBackground,
      appBar: AppBar(
        backgroundColor: AppColors.ideElevated,
        title: Text(widget.fileName ?? 'Editor', overflow: TextOverflow.ellipsis),
        actions: [
          contentAsync.maybeWhen(
            data: (content) => TextButton(
              onPressed: _isDirty && !_isSaving ? () => _save(content) : null,
              child: _isSaving
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary))
                  : Text('Save', style: TextStyle(color: _isDirty ? AppColors.primary : AppColors.mutedForeground)),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: contentAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) {
          final isPaymentRequired = error is ApiException && error.isPaymentRequired;
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                isPaymentRequired
                    ? 'Editing source code requires a Pro plan. Upgrade from the web app to unlock this.'
                    : (error is ApiException ? error.message : 'Failed to load file content.'),
                style: const TextStyle(color: AppColors.mutedForeground),
                textAlign: TextAlign.center,
              ),
            ),
          );
        },
        data: (content) => Column(
          children: [
            Expanded(
              child: MonacoWebView(
                content: _pendingContent ?? content,
                language: language,
                readOnly: false,
                onChanged: (value) => setState(() => _pendingContent = value == content ? null : value),
              ),
            ),
            if (_saveError != null)
              Container(
                width: double.infinity,
                color: AppColors.destructive.withValues(alpha: 0.15),
                padding: const EdgeInsets.all(12),
                child: Text(_saveError!, style: const TextStyle(color: AppColors.destructive), textAlign: TextAlign.center),
              ),
          ],
        ),
      ),
    );
  }
}
