import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../theme/app_theme.dart';
import 'diagram_screen.dart';

/// Entry point for the More → Diagrams tab: pick a file, then generate a
/// diagram for it. (File detail also links straight into DiagramScreen.)
class DiagramFilePickerScreen extends ConsumerWidget {
  const DiagramFilePickerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filesAsync = ref.watch(filesListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Diagrams')),
      body: filesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              e is ApiException ? e.message : 'Failed to load files.',
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
                  'No files yet. Add a file to visualize its architecture.',
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: files.length,
            itemBuilder: (context, index) {
              final file = files[index];
              return ListTile(
                leading: const Icon(Icons.account_tree_outlined, color: AppColors.mutedForeground),
                title: Text(file.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(file.language),
                trailing: const Icon(Icons.chevron_right, color: AppColors.mutedForeground),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => DiagramScreen(fileId: file.id, fileName: file.name)),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
