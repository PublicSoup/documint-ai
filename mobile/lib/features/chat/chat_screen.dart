import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../api/models/chat_session_summary.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';

/// Chat tab: the list of the user's saved conversations, newest first.
class ChatScreen extends ConsumerWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(chatSessionsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Chat')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/chat/new'),
        icon: const Icon(Icons.add),
        label: const Text('New chat'),
      ),
      body: sessionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              error is ApiException ? error.message : 'Failed to load conversations.',
              style: const TextStyle(color: AppColors.destructive),
              textAlign: TextAlign.center,
            ),
          ),
        ),
        data: (sessions) {
          if (sessions.isEmpty) {
            return _EmptyState(onStart: () => context.push('/chat/new'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(chatSessionsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              itemCount: sessions.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) => _SessionRow(
                session: sessions[index],
                onTap: () => context.push('/chat/session/${sessions[index].id}'),
                onDelete: () => _confirmDelete(context, ref, sessions[index]),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, ChatSessionSummary session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete conversation?'),
        content: Text('"${session.title}" will be permanently deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.destructive),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ref.read(chatRepositoryProvider).deleteSession(session.id);
      ref.invalidate(chatSessionsProvider);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to delete conversation.')));
      }
    }
  }
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session, required this.onTap, required this.onDelete});

  final ChatSessionSummary session;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: const Icon(Icons.chat_bubble_outline, color: AppColors.mutedForeground),
        title: Text(session.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text('${session.messageCount} message${session.messageCount == 1 ? '' : 's'}'),
        trailing: IconButton(
          icon: const Icon(Icons.delete_outline, color: AppColors.mutedForeground),
          onPressed: onDelete,
        ),
        onTap: onTap,
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onStart});
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.smart_toy_outlined, size: 40, color: AppColors.mutedForeground),
            const SizedBox(height: 16),
            Text('No conversations yet', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              'Start a new chat to ask the AI agent about your code, generate docs, or scaffold a project.',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(onPressed: onStart, icon: const Icon(Icons.add), label: const Text('New chat')),
          ],
        ),
      ),
    );
  }
}
