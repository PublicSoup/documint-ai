import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../api/api_exception.dart';
import '../../api/models/chat_message.dart';
import '../../api/repositories/chat_repository.dart';

/// Owns a single conversation's state and its streaming lifecycle. Kept as a
/// plain ChangeNotifier (created per conversation screen) rather than a
/// Riverpod family so the stream subscription has an obvious, bug-free
/// lifecycle tied to the screen it belongs to.
class ChatController extends ChangeNotifier {
  ChatController(this._repo, {this.sessionId, this.onSessionChanged});

  final ChatRepository _repo;

  /// Null for a brand-new chat; set once the backend's first `session_meta`
  /// event arrives (or when loading an existing session).
  String? sessionId;

  /// Fired after a stream completes so the sessions-list screen can refresh
  /// (a new session may have been created / an existing one updated).
  final VoidCallback? onSessionChanged;

  final List<ChatMessage> messages = [];
  String? model; // null => let the server pick the default model
  String? statusLabel; // transient "Thinking…" / "Running {tool}…" line
  bool isStreaming = false;
  bool _disposed = false;

  StreamSubscription<String>? _sub;

  Future<void> loadHistory() async {
    final id = sessionId;
    if (id == null) return;
    try {
      final loaded = await _repo.getSessionMessages(id);
      messages
        ..clear()
        ..addAll(loaded);
      _safeNotify();
    } catch (_) {
      // A failed history load leaves an empty conversation the user can still
      // continue; surfacing a hard error here would block a usable screen.
    }
  }

  /// Sends [text] and streams the agent's reply into a new assistant message.
  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty || isStreaming) return;

    messages.add(ChatMessage(id: _id(), role: 'user', content: trimmed));
    final assistant = ChatMessage(id: _id(), role: 'assistant', isStreaming: true);
    messages.add(assistant);
    isStreaming = true;
    statusLabel = 'Thinking…';
    _safeNotify();

    final history = _buildHistory(excludeLast: 2);

    try {
      final stream = await _repo.streamChat(
        message: trimmed,
        history: history,
        sessionId: sessionId,
        model: model,
      );
      _sub = stream.listen(
        (line) => _handleLine(line, assistant),
        onError: (Object e) => _finishWithError(assistant, e),
        onDone: () => _finish(assistant),
        cancelOnError: true,
      );
    } catch (e) {
      _finishWithError(assistant, e);
    }
  }

  void stop() {
    _sub?.cancel();
    _sub = null;
    if (isStreaming) {
      final last = messages.isNotEmpty ? messages.last : null;
      if (last != null && last.role == 'assistant') last.isStreaming = false;
      isStreaming = false;
      statusLabel = null;
      _safeNotify();
    }
  }

  /// Parses one NDJSON line into an agent event and applies it. Exposed
  /// (rather than private) so it can be unit-tested without a live stream.
  @visibleForTesting
  void handleLineForTest(String line, ChatMessage assistant) => _handleLine(line, assistant);

  void _handleLine(String line, ChatMessage assistant) {
    if (line.trim().isEmpty) return;

    Map<String, dynamic> event;
    try {
      final decoded = jsonDecode(line);
      if (decoded is! Map<String, dynamic>) return;
      event = decoded;
    } catch (_) {
      return; // Ignore any non-JSON keepalive/partial line.
    }

    switch (event['type'] as String?) {
      case 'session_meta':
        sessionId = event['sessionId'] as String? ?? sessionId;
        break;
      case 'response':
        assistant.content += event['content'] as String? ?? '';
        statusLabel = null;
        break;
      case 'thought':
        assistant.steps.add(ThoughtStep(type: 'thought', content: event['content'] as String? ?? ''));
        break;
      case 'tool_call':
        final tool = event['tool'] as String? ?? 'tool';
        assistant.steps.add(ThoughtStep(type: 'tool_call', content: 'Using $tool', toolName: tool));
        statusLabel = 'Running $tool…';
        break;
      case 'tool_result':
        assistant.steps.add(ThoughtStep(type: 'tool_result', content: event['result'] as String? ?? ''));
        break;
      case 'file_created':
        assistant.steps.add(ThoughtStep(type: 'file', content: 'Created ${event['fileName'] as String? ?? 'file'}'));
        break;
      case 'command_event':
        final cmd = event['command'] as String? ?? '';
        final status = event['status'] as String? ?? '';
        assistant.steps.add(ThoughtStep(type: 'command', content: '$cmd [$status]'));
        break;
      case 'state_change':
        final state = event['state'] as String? ?? '';
        final tool = event['tool'] as String?;
        statusLabel = tool != null ? '$state ($tool)…' : '$state…';
        break;
      case 'preview_ready':
        assistant.previewUrl = event['url'] as String?;
        break;
      case 'error':
        assistant.isError = true;
        assistant.content += (assistant.content.isEmpty ? '' : '\n\n') + (event['message'] as String? ?? 'An error occurred.');
        break;
      case 'error_report':
        assistant.steps.add(ThoughtStep(type: 'error_report', content: event['summary'] as String? ?? ''));
        break;
      default:
        break; // Unknown event types are ignored forward-compatibly.
    }
    _safeNotify();
  }

  void _finish(ChatMessage assistant) {
    assistant.isStreaming = false;
    if (assistant.content.isEmpty && !assistant.isError) {
      assistant.content = '(No response.)';
    }
    isStreaming = false;
    statusLabel = null;
    _sub = null;
    _safeNotify();
    onSessionChanged?.call();
  }

  void _finishWithError(ChatMessage assistant, Object error) {
    assistant.isStreaming = false;
    assistant.isError = true;
    final message = error is ApiException ? error.message : 'The chat request failed. Please try again.';
    assistant.content += (assistant.content.isEmpty ? '' : '\n\n') + message;
    isStreaming = false;
    statusLabel = null;
    _sub = null;
    _safeNotify();
  }

  /// Maps prior completed messages to the backend's history format
  /// (`{role, content}`, ≤30 entries, content ≤10000 chars server-side).
  List<Map<String, String>> _buildHistory({required int excludeLast}) {
    final end = messages.length - excludeLast;
    final prior = end > 0 ? messages.sublist(0, end) : <ChatMessage>[];
    final recent = prior.length > 20 ? prior.sublist(prior.length - 20) : prior;
    return recent
        .where((m) => m.content.trim().isNotEmpty)
        .map((m) => {
              'role': m.role,
              'content': m.content.length > 10000 ? m.content.substring(0, 10000) : m.content,
            })
        .toList();
  }

  String _id() => DateTime.now().microsecondsSinceEpoch.toString();

  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _sub?.cancel();
    super.dispose();
  }
}
