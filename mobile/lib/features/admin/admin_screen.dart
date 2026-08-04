import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../theme/app_theme.dart';

const _severityColors = {
  'healthy': AppColors.success,
  'degraded': AppColors.warning,
  'critical': AppColors.destructive,
};

/// Read-only admin console: system health, users, and the audit trail.
/// Mutating actions (role changes, password resets) stay on the web app.
class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Admin'),
          bottom: const TabBar(tabs: [Tab(text: 'Health'), Tab(text: 'Users'), Tab(text: 'Audit')]),
        ),
        body: const TabBarView(children: [_HealthTab(), _UsersTab(), _AuditTab()]),
      ),
    );
  }
}

/// Shared error rendering: a 403 here means "not an admin", which is a
/// permissions state rather than a failure worth shouting about.
Widget _errorState(BuildContext context, Object error, {String fallback = 'Something went wrong.'}) {
  final isForbidden = error is ApiException && error.isForbidden;
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(isForbidden ? Icons.lock_outline : Icons.error_outline,
              size: 40, color: isForbidden ? AppColors.primary : AppColors.destructive),
          const SizedBox(height: 16),
          Text(
            isForbidden ? 'Admin access required' : 'Failed to load',
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            error is ApiException ? error.message : fallback,
            style: Theme.of(context).textTheme.bodySmall,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}

class _HealthTab extends ConsumerWidget {
  const _HealthTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adminHealthProvider);

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _errorState(context, e, fallback: 'Failed to load system health.'),
      data: (health) => RefreshIndicator(
        onRefresh: () => ref.refresh(adminHealthProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        _SeverityDot(severity: health.severity),
                        const SizedBox(width: 8),
                        Text(health.status.toUpperCase(), style: Theme.of(context).textTheme.titleMedium),
                        const Spacer(),
                        Text('${health.opsReadinessScore}/100', style: Theme.of(context).textTheme.titleMedium),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text('Ops readiness: ${health.opsReadinessBand}', style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 8),
                    Text('${health.totalUsers} registered users', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Components', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final c in health.components)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: _SeverityDot(severity: c.severity),
                  title: Text(_componentLabel(c.name)),
                  trailing: Text(c.status, style: Theme.of(context).textTheme.bodySmall),
                ),
              ),
            if (health.recommendedActions.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Recommended actions', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final action in health.recommendedActions)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.arrow_right, size: 18, color: AppColors.warning),
                      const SizedBox(width: 4),
                      Expanded(child: Text(action, style: Theme.of(context).textTheme.bodySmall)),
                    ],
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  String _componentLabel(String name) {
    switch (name) {
      case 'database':
        return 'Database';
      case 'ai':
        return 'AI provider';
      case 'auditTrail':
        return 'Audit trail';
      case 'rateLimit':
        return 'Rate limiting';
      case 'webContainer':
        return 'IDE runtime';
      default:
        return name;
    }
  }
}

class _SeverityDot extends StatelessWidget {
  const _SeverityDot({required this.severity});
  final String severity;

  @override
  Widget build(BuildContext context) {
    final color = _severityColors[severity] ?? AppColors.mutedForeground;
    return Container(
      height: 12,
      width: 12,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

class _UsersTab extends ConsumerStatefulWidget {
  const _UsersTab();

  @override
  ConsumerState<_UsersTab> createState() => _UsersTabState();
}

class _UsersTabState extends ConsumerState<_UsersTab> {
  final _controller = TextEditingController();
  String _search = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminUsersProvider(_search));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _controller,
            decoration: const InputDecoration(
              hintText: 'Search by name or email',
              prefixIcon: Icon(Icons.search, color: AppColors.mutedForeground),
            ),
            onSubmitted: (value) => setState(() => _search = value.trim()),
          ),
        ),
        Expanded(
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => _errorState(context, e, fallback: 'Failed to load users.'),
            data: (users) {
              if (users.isEmpty) {
                return Center(child: Text('No users found.', style: Theme.of(context).textTheme.bodySmall));
              }
              return ListView.separated(
                itemCount: users.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final u = users[index];
                  return ListTile(
                    leading: CircleAvatar(
                      backgroundColor: AppColors.secondary,
                      child: Text((u.name ?? u.email ?? '?').characters.first.toUpperCase()),
                    ),
                    title: Text(u.name ?? u.email ?? 'User'),
                    subtitle: Text('${u.email ?? ''} · ${u.fileCount} files'),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(u.role, style: TextStyle(
                          color: u.role == 'ADMIN' ? AppColors.primary : AppColors.mutedForeground,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        )),
                        if (u.plan != null) Text(u.plan!, style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

class _AuditTab extends ConsumerWidget {
  const _AuditTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(auditLogProvider);

    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _errorState(context, e, fallback: 'Failed to load the audit log.'),
      data: (logs) {
        if (logs.isEmpty) {
          return Center(child: Text('No audit entries.', style: Theme.of(context).textTheme.bodySmall));
        }
        return RefreshIndicator(
          onRefresh: () => ref.refresh(auditLogProvider.future),
          child: ListView.separated(
            itemCount: logs.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final log = logs[index];
              return ListTile(
                dense: true,
                leading: Icon(
                  log.severity == 'WARNING' || log.severity == 'CRITICAL' ? Icons.warning_amber_outlined : Icons.check_circle_outline,
                  size: 20,
                  color: log.severity == 'CRITICAL'
                      ? AppColors.destructive
                      : log.severity == 'WARNING'
                          ? AppColors.warning
                          : AppColors.mutedForeground,
                ),
                title: Text(log.action, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                subtitle: Text(
                  '${log.entity} · ${log.actorName ?? log.actorEmail ?? 'system'}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              );
            },
          ),
        );
      },
    );
  }
}
