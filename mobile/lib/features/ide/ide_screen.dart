import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../theme/app_theme.dart';

/// File tree entry point for the in-app editor. Tapping a file pushes
/// `/ide/:fileId`, which opens `CodeEditorScreen` (Monaco-in-WebView).
class IdeScreen extends ConsumerWidget {
  const IdeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filesAsync = ref.watch(filesListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('IDE')),
      body: filesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              error is ApiException ? error.message : 'Failed to load files.',
              style: const TextStyle(color: AppColors.destructive),
              textAlign: TextAlign.center,
            ),
          ),
        ),
        data: (files) {
          if (files.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'No files yet. Upload or create one from the web app to get started.',
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.refresh(filesListProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: files.length,
              itemBuilder: (context, index) {
                final file = files[index];
                return ListTile(
                  leading: const Icon(Icons.description_outlined, color: AppColors.mutedForeground),
                  title: Text(file.name),
                  subtitle: Text(file.language),
                  trailing: const Icon(Icons.chevron_right, color: AppColors.mutedForeground),
                  onTap: () => context.push('/ide/${file.id}', extra: file.name),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
