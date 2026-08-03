import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../api/models/provider_keys.dart';
import '../../api/providers.dart';
import '../../auth/auth_controller.dart';
import '../../theme/app_theme.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  static const _providerLabels = {
    'google': 'Google Gemini',
    'anthropic': 'Anthropic Claude',
    'openai': 'OpenAI',
    'xai': 'xAI Grok',
    'deepseek': 'DeepSeek',
    'openrouter': 'OpenRouter',
    'custom': 'Custom (OpenAI-compatible)',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull;
    final keysAsync = ref.watch(providerKeysProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionTitle('Profile'),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(user?.name ?? '—', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(user?.email ?? '', style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      OutlinedButton(
                        onPressed: () => _editProfile(context, ref, user?.name),
                        child: const Text('Edit name'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () => _changePassword(context, ref),
                        child: const Text('Change password'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          _SectionTitle('AI Provider Keys'),
          Text(
            'Add your own provider API keys to use your own AI quota. Keys are stored encrypted and never shown again.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          keysAsync.when(
            loading: () => const Card(child: Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator()))),
            error: (e, _) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(e is ApiException ? e.message : 'Failed to load key status.'))),
            data: (status) => Column(
              children: [
                for (final id in ProviderKeyStatus.providerIds)
                  _ProviderRow(
                    id: id,
                    label: _providerLabels[id] ?? id,
                    isSet: status.providers[id] ?? false,
                    onSet: () => _setKey(context, ref, id, _providerLabels[id] ?? id),
                    onClear: () => _clearKey(context, ref, id),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _SectionTitle('DocuMint API Key'),
          Text('For programmatic access to the DocuMint API.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          _DocuMintKeyCard(),
          const SizedBox(height: 24),
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

  Future<void> _editProfile(BuildContext context, WidgetRef ref, String? currentName) async {
    final messenger = ScaffoldMessenger.of(context);
    final controller = TextEditingController(text: currentName ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit name'),
        content: TextField(controller: controller, decoration: const InputDecoration(labelText: 'Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved != true || controller.text.trim().isEmpty) return;
    try {
      await ref.read(accountRepositoryProvider).updateProfile(name: controller.text.trim());
      ref.invalidate(authControllerProvider);
      _toast(messenger, 'Profile updated.');
    } catch (e) {
      _toast(messenger, e is ApiException ? e.message : 'Update failed.');
    }
  }

  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    final current = TextEditingController();
    final next = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change password'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
            const SizedBox(height: 12),
            TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'New password (min 8)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Update')),
        ],
      ),
    );
    if (saved != true) return;
    try {
      await ref.read(accountRepositoryProvider).updateProfile(currentPassword: current.text, newPassword: next.text);
      _toast(messenger, 'Password updated.');
    } catch (e) {
      _toast(messenger, e is ApiException ? e.message : 'Update failed.');
    }
  }

  Future<void> _setKey(BuildContext context, WidgetRef ref, String provider, String label) async {
    final messenger = ScaffoldMessenger.of(context);
    final key = TextEditingController();
    final baseUrl = TextEditingController();
    final modelId = TextEditingController();
    final isCustom = provider == 'custom';
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Set $label key'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: key, decoration: const InputDecoration(labelText: 'API key')),
            if (isCustom) ...[
              const SizedBox(height: 12),
              TextField(controller: baseUrl, decoration: const InputDecoration(labelText: 'Base URL (https://…)')),
              const SizedBox(height: 12),
              TextField(controller: modelId, decoration: const InputDecoration(labelText: 'Model ID')),
            ],
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved != true || key.text.trim().isEmpty) return;
    try {
      await ref.read(accountRepositoryProvider).setProviderKey(
            provider: provider,
            apiKey: key.text.trim(),
            baseUrl: isCustom ? baseUrl.text.trim() : null,
            modelId: isCustom ? modelId.text.trim() : null,
          );
      ref.invalidate(providerKeysProvider);
      _toast(messenger, '$label key saved.');
    } catch (e) {
      _toast(messenger, e is ApiException ? e.message : 'Failed to save key.');
    }
  }

  Future<void> _clearKey(BuildContext context, WidgetRef ref, String provider) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(accountRepositoryProvider).deleteProviderKey(provider);
      ref.invalidate(providerKeysProvider);
      _toast(messenger, 'Key removed.');
    } catch (e) {
      _toast(messenger, e is ApiException ? e.message : 'Failed to remove key.');
    }
  }

  void _toast(ScaffoldMessengerState messenger, String message) {
    messenger.showSnackBar(SnackBar(content: Text(message)));
  }
}

class _ProviderRow extends StatelessWidget {
  const _ProviderRow({required this.id, required this.label, required this.isSet, required this.onSet, required this.onClear});
  final String id;
  final String label;
  final bool isSet;
  final VoidCallback onSet;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(label),
        subtitle: Text(isSet ? 'Configured' : 'Not set', style: TextStyle(color: isSet ? AppColors.success : AppColors.mutedForeground)),
        trailing: isSet
            ? IconButton(icon: const Icon(Icons.delete_outline, color: AppColors.mutedForeground), onPressed: onClear)
            : TextButton(onPressed: onSet, child: const Text('Add')),
        onTap: onSet,
      ),
    );
  }
}

class _DocuMintKeyCard extends ConsumerStatefulWidget {
  @override
  ConsumerState<_DocuMintKeyCard> createState() => _DocuMintKeyCardState();
}

class _DocuMintKeyCardState extends ConsumerState<_DocuMintKeyCard> {
  String? _masked;
  bool _loading = true;
  bool _generating = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final keys = await ref.read(accountRepositoryProvider).getDocuMintKeys();
      if (mounted) setState(() { _masked = keys.isNotEmpty ? keys.first.maskedKey : null; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _generate() async {
    setState(() => _generating = true);
    try {
      final key = await ref.read(accountRepositoryProvider).generateDocuMintKey();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Your new API key'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Copy it now — it will not be shown again.'),
              const SizedBox(height: 12),
              SelectableText(key, style: const TextStyle(fontFamily: 'monospace')),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () { Clipboard.setData(ClipboardData(text: key)); Navigator.pop(ctx); },
              child: const Text('Copy & close'),
            ),
          ],
        ),
      );
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to generate key.')));
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(
              child: _loading
                  ? const Text('Loading…')
                  : Text(_masked ?? 'No key yet', style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
            ),
            const SizedBox(width: 12),
            OutlinedButton(
              onPressed: _generating ? null : _generate,
              child: _generating
                  ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_masked == null ? 'Generate' : 'Rotate'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}
