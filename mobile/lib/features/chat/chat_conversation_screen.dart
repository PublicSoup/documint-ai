import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/data_providers.dart';
import '../../api/models/chat_message.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/web_view_screen.dart';
import 'chat_controller.dart';

class ChatConversationScreen extends ConsumerStatefulWidget {
  const ChatConversationScreen({super.key, this.sessionId});

  /// Null for a brand-new chat.
  final String? sessionId;

  @override
  ConsumerState<ChatConversationScreen> createState() => _ChatConversationScreenState();
}

class _ChatConversationScreenState extends ConsumerState<ChatConversationScreen> {
  late final ChatController _controller;
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _controller = ChatController(
      ref.read(chatRepositoryProvider),
      sessionId: widget.sessionId,
      onSessionChanged: () => ref.invalidate(chatSessionsProvider),
    );
    _controller.addListener(_onControllerChanged);
    if (widget.sessionId != null) _controller.loadHistory();
  }

  @override
  void dispose() {
    _controller.removeListener(_onControllerChanged);
    _controller.dispose();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onControllerChanged() {
    if (mounted) setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
    );
  }

  void _send() {
    final text = _inputController.text;
    if (text.trim().isEmpty || _controller.isStreaming) return;
    _inputController.clear();
    _controller.send(text);
  }

  @override
  Widget build(BuildContext context) {
    final messages = _controller.messages;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Chat'),
        actions: [_ModelPickerButton(controller: _controller)],
      ),
      body: Column(
        children: [
          Expanded(
            child: messages.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        'Ask the AI agent anything about your code.',
                        style: Theme.of(context).textTheme.bodySmall,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: messages.length,
                    itemBuilder: (context, index) => _MessageBubble(message: messages[index]),
                  ),
          ),
          if (_controller.statusLabel != null) _StatusLine(label: _controller.statusLabel!),
          _InputBar(
            controller: _inputController,
            isStreaming: _controller.isStreaming,
            onSend: _send,
            onStop: _controller.stop,
          ),
        ],
      ),
    );
  }
}

class _ModelPickerButton extends ConsumerWidget {
  const _ModelPickerButton({required this.controller});
  final ChatController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final modelsAsync = ref.watch(aiModelsProvider);
    final models = modelsAsync.valueOrNull ?? const [];
    if (models.isEmpty) return const SizedBox.shrink();

    return PopupMenuButton<String?>(
      icon: const Icon(Icons.tune),
      tooltip: 'Model',
      onSelected: (value) => controller.model = value,
      itemBuilder: (context) => [
        const PopupMenuItem<String?>(value: null, child: Text('Auto (default)')),
        for (final model in models)
          PopupMenuItem<String?>(value: model.id, child: Text(model.label)),
      ],
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    if (message.isUser) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12, left: 40),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
          child: SelectableText(message.content, style: const TextStyle(color: AppColors.primaryForeground)),
        ),
      );
    }

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12, right: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.steps.isNotEmpty) _ThinkingSection(steps: message.steps),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(AppRadius.lg),
                border: Border.all(color: message.isError ? AppColors.destructive : AppColors.border),
              ),
              child: message.content.isEmpty && message.isStreaming
                  ? const _TypingDots()
                  : _AssistantContent(content: message.content),
            ),
            if (message.previewUrl != null) _PreviewButton(url: message.previewUrl!),
          ],
        ),
      ),
    );
  }
}

/// Splits assistant text on triple-backtick fences and renders code blocks in
/// a monospace surface. Deliberately lightweight — no markdown dependency.
class _AssistantContent extends StatelessWidget {
  const _AssistantContent({required this.content});
  final String content;

  @override
  Widget build(BuildContext context) {
    final parts = content.split('```');
    if (parts.length == 1) {
      return SelectableText(content, style: const TextStyle(height: 1.4));
    }

    final widgets = <Widget>[];
    for (var i = 0; i < parts.length; i++) {
      final part = parts[i];
      final isCode = i.isOdd;
      if (part.trim().isEmpty) continue;
      if (isCode) {
        // Drop an optional language hint on the first line of a code fence.
        final firstBreak = part.indexOf('\n');
        final code = firstBreak >= 0 && !part.substring(0, firstBreak).contains(' ')
            ? part.substring(firstBreak + 1)
            : part;
        widgets.add(Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.ideBackground,
            borderRadius: BorderRadius.circular(AppRadius.sm),
            border: Border.all(color: AppColors.border),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SelectableText(code.trimRight(), style: const TextStyle(fontFamily: 'monospace', fontSize: 13, height: 1.4)),
          ),
        ));
      } else {
        widgets.add(SelectableText(part.trim(), style: const TextStyle(height: 1.4)));
      }
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: widgets);
  }
}

class _ThinkingSection extends StatelessWidget {
  const _ThinkingSection({required this.steps});
  final List<ThoughtStep> steps;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 8),
        dense: true,
        leading: const Icon(Icons.psychology_outlined, size: 18, color: AppColors.mutedForeground),
        title: Text('Thinking (${steps.length} step${steps.length == 1 ? '' : 's'})', style: Theme.of(context).textTheme.bodySmall),
        children: [
          for (final step in steps)
            Padding(
              padding: const EdgeInsets.only(left: 8, bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(_iconFor(step.type), size: 14, color: AppColors.mutedForeground),
                  const SizedBox(width: 8),
                  Expanded(child: Text(step.content, style: Theme.of(context).textTheme.bodySmall, maxLines: 6, overflow: TextOverflow.ellipsis)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'tool_call':
        return Icons.build_outlined;
      case 'tool_result':
        return Icons.check_circle_outline;
      case 'file':
        return Icons.insert_drive_file_outlined;
      case 'command':
        return Icons.terminal_outlined;
      case 'error_report':
        return Icons.error_outline;
      default:
        return Icons.circle_outlined;
    }
  }
}

class _PreviewButton extends StatelessWidget {
  const _PreviewButton({required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: OutlinedButton.icon(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => WebViewScreen(url: url, title: 'Preview')),
        ),
        icon: const Icon(Icons.open_in_new, size: 16),
        label: const Text('Open preview'),
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          const SizedBox(
            height: 12,
            width: 12,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
          ),
          const SizedBox(width: 8),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _TypingDots extends StatelessWidget {
  const _TypingDots();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 16,
      width: 16,
      child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.mutedForeground),
    );
  }
}

class _InputBar extends StatelessWidget {
  const _InputBar({required this.controller, required this.isStreaming, required this.onSend, required this.onStop});

  final TextEditingController controller;
  final bool isStreaming;
  final VoidCallback onSend;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: const BoxDecoration(
          color: AppColors.card,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                enabled: !isStreaming,
                textInputAction: TextInputAction.newline,
                decoration: const InputDecoration(hintText: 'Message the agent…'),
              ),
            ),
            const SizedBox(width: 8),
            isStreaming
                ? IconButton.filled(
                    onPressed: onStop,
                    icon: const Icon(Icons.stop),
                    style: IconButton.styleFrom(backgroundColor: AppColors.destructive),
                  )
                : IconButton.filled(onPressed: onSend, icon: const Icon(Icons.arrow_upward)),
          ],
        ),
      ),
    );
  }
}
