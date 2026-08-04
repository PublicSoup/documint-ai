import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';
import 'mermaid_webview.dart';

const _diagramTypes = [
  (value: 'class', label: 'Class'),
  (value: 'sequence', label: 'Sequence'),
  (value: 'flowchart', label: 'Flowchart'),
  (value: 'state', label: 'State'),
  (value: 'er', label: 'ER'),
];

/// Generates and renders an AI architecture diagram for one file.
class DiagramScreen extends ConsumerStatefulWidget {
  const DiagramScreen({super.key, required this.fileId, this.fileName});

  final String fileId;
  final String? fileName;

  @override
  ConsumerState<DiagramScreen> createState() => _DiagramScreenState();
}

class _DiagramScreenState extends ConsumerState<DiagramScreen> {
  String _type = 'class';
  bool _loading = false;
  String? _diagram;
  String? _error;
  bool _upgradeRequired = false;

  Future<void> _generate() async {
    setState(() {
      _loading = true;
      _error = null;
      _upgradeRequired = false;
    });

    try {
      final diagram = await ref.read(diagramsRepositoryProvider).generate(fileId: widget.fileId, type: _type);
      if (mounted) setState(() => _diagram = diagram);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (e is ApiException && e.isForbidden) {
          _upgradeRequired = true;
          _error = e.message;
        } else if (e is ApiException && e.statusCode == 502) {
          // The route returns 502 DIAGRAM_INVALID when the model emits
          // malformed Mermaid — retrying usually fixes it.
          _error = 'The AI produced an invalid diagram. Tap Generate to retry.';
        } else {
          _error = e is ApiException ? e.message : 'Failed to generate the diagram.';
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ideBackground,
      appBar: AppBar(
        backgroundColor: AppColors.ideElevated,
        title: Text(widget.fileName ?? 'Diagram', overflow: TextOverflow.ellipsis),
        actions: [
          if (_diagram != null)
            IconButton(
              icon: const Icon(Icons.copy, size: 20),
              tooltip: 'Copy Mermaid source',
              onPressed: () {
                Clipboard.setData(ClipboardData(text: _diagram!));
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Mermaid source copied.')));
              },
            ),
        ],
      ),
      body: Column(
        children: [
          Container(
            color: AppColors.ideElevated,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final t in _diagramTypes)
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: ChoiceChip(
                              label: Text(t.label),
                              selected: _type == t.value,
                              onSelected: _loading ? null : (_) => setState(() => _type = t.value),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _loading ? null : _generate,
                  child: _loading
                      ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primaryForeground))
                      : const Text('Generate'),
                ),
              ],
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_upgradeRequired) {
      return _CenteredNotice(
        icon: Icons.lock_outline,
        iconColor: AppColors.primary,
        title: 'Diagrams require a paid plan',
        message: _error ?? 'Upgrade your plan to generate architecture diagrams.',
      );
    }
    if (_error != null) {
      return _CenteredNotice(
        icon: Icons.error_outline,
        iconColor: AppColors.destructive,
        title: 'Generation failed',
        message: _error!,
      );
    }
    if (_loading && _diagram == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_diagram == null) {
      return const _CenteredNotice(
        icon: Icons.account_tree_outlined,
        iconColor: AppColors.mutedForeground,
        title: 'No diagram yet',
        message: 'Pick a diagram type above and tap Generate to visualize this file.',
      );
    }
    return MermaidWebView(code: _diagram!);
  }
}

class _CenteredNotice extends StatelessWidget {
  const _CenteredNotice({required this.icon, required this.iconColor, required this.title, required this.message});

  final IconData icon;
  final Color iconColor;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: iconColor),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(message, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
