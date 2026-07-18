import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/auth_controller.dart';
import '../../theme/app_theme.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  // Teams/Reviews/Rulesets/Settings/Billing screens land in a later phase —
  // the app already has working auth, so this tab surfaces account state
  // and sign-out now rather than blocking on screens that aren't built yet.
  static const _menuItems = [
    (icon: Icons.groups_outlined, label: 'Teams'),
    (icon: Icons.fact_check_outlined, label: 'Reviews & Rulesets'),
    (icon: Icons.credit_card_outlined, label: 'Billing'),
    (icon: Icons.settings_outlined, label: 'Settings'),
    (icon: Icons.admin_panel_settings_outlined, label: 'Admin'),
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
                subtitle: const Text('Coming soon'),
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
