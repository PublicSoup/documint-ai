import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../api/models/app_notification.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/web_view_screen.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(notificationsRepositoryProvider).markAllRead();
              ref.invalidate(notificationsProvider);
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(e is ApiException ? e.message : 'Failed to load notifications.', style: const TextStyle(color: AppColors.destructive)),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return Center(child: Text("You're all caught up.", style: Theme.of(context).textTheme.bodySmall));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(notificationsProvider.future),
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) => _NotificationRow(
                notification: items[index],
                onTap: () => _onTap(context, ref, items[index]),
                onDelete: () async {
                  await ref.read(notificationsRepositoryProvider).delete(items[index].id);
                  ref.invalidate(notificationsProvider);
                },
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _onTap(BuildContext context, WidgetRef ref, AppNotification n) async {
    if (!n.read) {
      await ref.read(notificationsRepositoryProvider).markRead(n.id);
      ref.invalidate(notificationsProvider);
    }
    final link = n.link;
    if (link != null && link.startsWith('http') && context.mounted) {
      Navigator.push(context, MaterialPageRoute(builder: (_) => WebViewScreen(url: link, title: 'Notification')));
    }
  }
}

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.notification, required this.onTap, required this.onDelete});
  final AppNotification notification;
  final VoidCallback onTap;
  final Future<void> Function() onDelete;

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: ValueKey(notification.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDelete(),
      background: Container(
        color: AppColors.destructive.withValues(alpha: 0.2),
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Icon(Icons.delete_outline, color: AppColors.destructive),
      ),
      child: ListTile(
        leading: Icon(
          notification.read ? Icons.notifications_none : Icons.notifications_active,
          color: notification.read ? AppColors.mutedForeground : AppColors.primary,
        ),
        title: Text(
          notification.message,
          style: TextStyle(fontWeight: notification.read ? FontWeight.normal : FontWeight.w600),
        ),
        subtitle: Text(notification.type, style: Theme.of(context).textTheme.bodySmall),
        onTap: onTap,
      ),
    );
  }
}
