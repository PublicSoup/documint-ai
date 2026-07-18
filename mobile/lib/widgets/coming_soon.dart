import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Placeholder for tabs whose real screens land in a later phase.
class ComingSoon extends StatelessWidget {
  const ComingSoon({super.key, required this.title, required this.description, this.icon = Icons.hourglass_empty});

  final String title;
  final String description;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: AppColors.mutedForeground),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(description, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
