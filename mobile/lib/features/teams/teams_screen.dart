import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../api/models/team.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';

class TeamsScreen extends ConsumerWidget {
  const TeamsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teamsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Teams')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createTeam(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('New team'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(e is ApiException ? e.message : 'Failed to load teams.', style: const TextStyle(color: AppColors.destructive)),
          ),
        ),
        data: (teams) {
          if (teams.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text('You are not part of any team yet. Create one to collaborate.', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(teamsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              itemCount: teams.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final t = teams[index];
                return Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: const Icon(Icons.groups_outlined, color: AppColors.mutedForeground),
                    title: Text(t.name),
                    subtitle: Text('${t.memberCount} member${t.memberCount == 1 ? '' : 's'}${t.role != null ? ' · ${t.role}' : ''}'),
                    trailing: const Icon(Icons.chevron_right, color: AppColors.mutedForeground),
                    onTap: () => context.push('/more/teams/${t.id}'),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  Future<void> _createTeam(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final controller = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New team'),
        content: TextField(controller: controller, decoration: const InputDecoration(labelText: 'Team name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
        ],
      ),
    );
    if (saved != true || controller.text.trim().length < 2) return;
    try {
      await ref.read(teamsRepositoryProvider).createTeam(controller.text.trim());
      ref.invalidate(teamsProvider);
      messenger.showSnackBar(const SnackBar(content: Text('Team created.')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to create team.')));
    }
  }
}

class TeamDetailScreen extends ConsumerWidget {
  const TeamDetailScreen({super.key, required this.teamId});
  final String teamId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(teamDetailProvider(teamId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Team'),
        actions: [
          async.maybeWhen(
            data: (team) => IconButton(
              icon: const Icon(Icons.person_add_alt),
              tooltip: 'Invite',
              onPressed: () => _invite(context, ref, team),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(e is ApiException ? e.message : 'Failed to load team.', style: const TextStyle(color: AppColors.destructive)),
          ),
        ),
        data: (team) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(team.name, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            if (team.slug != null) Text('@${team.slug}', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 20),
            Text('Members', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final m in team.members)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: AppColors.secondary,
                    child: Text((m.name ?? m.email ?? '?').characters.first.toUpperCase()),
                  ),
                  title: Text(m.name ?? m.email ?? 'Member'),
                  subtitle: Text(m.email ?? ''),
                  trailing: Text(m.role, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600)),
                ),
              ),
            if (team.invites.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Pending invites', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final inv in team.invites)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.mail_outline, color: AppColors.mutedForeground),
                    title: Text(inv.email),
                    trailing: Text(inv.role, style: Theme.of(context).textTheme.bodySmall),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _invite(BuildContext context, WidgetRef ref, Team team) async {
    final messenger = ScaffoldMessenger.of(context);
    final email = TextEditingController();
    var role = 'MEMBER';
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('Invite member'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: const [
                  DropdownMenuItem(value: 'MEMBER', child: Text('Member')),
                  DropdownMenuItem(value: 'ADMIN', child: Text('Admin')),
                ],
                onChanged: (v) => setState(() => role = v ?? 'MEMBER'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send')),
          ],
        ),
      ),
    );
    if (saved != true || email.text.trim().isEmpty) return;
    try {
      await ref.read(teamsRepositoryProvider).invite(teamId: team.id, email: email.text.trim(), role: role);
      ref.invalidate(teamDetailProvider(team.id));
      messenger.showSnackBar(const SnackBar(content: Text('Invite sent.')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to send invite.')));
    }
  }
}
