import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/auth_controller.dart';
import '../../theme/app_theme.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  static const _menuItems = [
    (icon: Icons.groups_outlined, label: 'Teams', route: '/more/teams'),
    (icon: Icons.fact_check_outlined, label: 'Reviews', route: '/more/reviews'),
    (icon: Icons.account_tree_outlined, label: 'Diagrams', route: '/more/diagrams'),
    (icon: Icons.rule_folder_outlined, label: 'Ruleset Generator', route: '/more/rulesets'),
    (icon: Icons.notifications_outlined, label: 'Notifications', route: '/more/notifications'),
    (icon: Icons.search, label: 'Search', route: '/more/search'),
    (icon: Icons.credit_card_outlined, label: 'Billing & Plans', route: '/more/billing'),
    (icon: Icons.settings_outlined, label: 'Settings', route: '/more/settings'),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(authControllerProvider);
    final user = userAsync.valueOrNull;

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(user?.name ?? 'Your account', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(user?.email ?? '', style: Theme.of(context).textTheme.bodySmall),
                  if (user?.role == 'ADMIN') ...[
                    const SizedBox(height: 8),
                    const Text('Admin', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600)),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          for (final item in _menuItems)
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: Icon(item.icon, color: AppColors.mutedForeground),
                title: Text(item.label),
                trailing: const Icon(Icons.chevron_right, color: AppColors.mutedForeground),
                onTap: () => context.push(item.route),
              ),
            ),
          if (user?.role == 'ADMIN')
            Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                leading: const Icon(Icons.admin_panel_settings_outlined, color: AppColors.mutedForeground),
                title: const Text('Admin'),
                trailing: const Icon(Icons.chevron_right, color: AppColors.mutedForeground),
                onTap: () => context.push('/more/admin'),
              ),
            ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(foregroundColor: AppColors.destructive, side: const BorderSide(color: AppColors.destructive)),
              onPressed: () => ref.read(authControllerProvider.notifier).logout(),
              child: const Text('Sign Out'),
            ),
          ),
        ],
      ),
    );
  }
}
