import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';

/// Generates AI-assistant ruleset files (Cursor/Cline/Gemini) from a project
/// description. Backed by POST /api/rulesets/generate — feature-gated, so a
/// 403 renders an upgrade prompt rather than an error.
class RulesetsScreen extends ConsumerStatefulWidget {
  const RulesetsScreen({super.key});

  @override
  ConsumerState<RulesetsScreen> createState() => _RulesetsScreenState();
}

class _RulesetsScreenState extends ConsumerState<RulesetsScreen> {
  final _context = TextEditingController();
  final _requirements = TextEditingController();
  String _type = 'cursor';
  bool _loading = false;
  String? _result;
  String? _error;
  bool _upgradeRequired = false;

  @override
  void dispose() {
    _context.dispose();
    _requirements.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    if (_context.text.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
      _upgradeRequired = false;
    });
    try {
      final json = await ref.read(apiClientProvider).postJson<Map<String, dynamic>>(
        '/api/rulesets/generate',
        body: {
          'type': _type,
          'context': _context.text.trim(),
          'requirements': _requirements.text.trim().isEmpty ? null : _requirements.text.trim(),
        },
      );
      setState(() => _result = json['ruleset'] as String? ?? '');
    } catch (e) {
      setState(() {
        if (e is ApiException && e.isForbidden) {
          _upgradeRequired = true;
          _error = e.message;
        } else {
          _error = e is ApiException ? e.message : 'Failed to generate ruleset.';
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ruleset Generator')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Generate an AI-assistant ruleset from a description of your project.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Format'),
            items: const [
              DropdownMenuItem(value: 'cursor', child: Text('Cursor (.cursorrules)')),
              DropdownMenuItem(value: 'cline', child: Text('Cline')),
              DropdownMenuItem(value: 'gemini', child: Text('Gemini')),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'cursor'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _context,
            maxLines: 5,
            decoration: const InputDecoration(labelText: 'Project context', hintText: 'Describe your stack, conventions, goals…'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _requirements,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Specific requirements (optional)'),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _loading ? null : _generate,
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primaryForeground))
                  : const Text('Generate'),
            ),
          ),
          if (_upgradeRequired) ...[
            const SizedBox(height: 16),
            _UpgradeCard(message: _error ?? 'This feature requires a paid plan.'),
          ] else if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(color: AppColors.destructive)),
          ],
          if (_result != null) ...[
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Generated ruleset', style: Theme.of(context).textTheme.titleMedium),
                IconButton(
                  icon: const Icon(Icons.copy, size: 18),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: _result!));
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied.')));
                  },
                ),
              ],
            ),
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.ideBackground,
                borderRadius: BorderRadius.circular(AppRadius.sm),
                border: Border.all(color: AppColors.border),
              ),
              child: SelectableText(_result!, style: const TextStyle(fontFamily: 'monospace', fontSize: 13, height: 1.4)),
            ),
          ],
        ],
      ),
    );
  }
}

class _UpgradeCard extends StatelessWidget {
  const _UpgradeCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.lock_outline, color: AppColors.primary),
            const SizedBox(width: 12),
            Expanded(child: Text(message, style: Theme.of(context).textTheme.bodyMedium)),
          ],
        ),
      ),
    );
  }
}
