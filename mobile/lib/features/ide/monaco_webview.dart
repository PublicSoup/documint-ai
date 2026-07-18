import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Monaco Editor embedded via `webview_flutter`, loading the bundled
/// `assets/monaco/editor.html` (Monaco's JS/CSS themselves come from the
/// jsdelivr CDN the web app's own CSP already allowlists — see that file's
/// header comment for why). Communication is a small JS<->Dart bridge:
/// Dart calls `setEditorContent`/`setEditorReadOnly` via `runJavaScript`,
/// and the page posts `{type: 'ready' | 'change', ...}` back over the
/// `FlutterBridge` JavaScript channel.
class MonacoWebView extends StatefulWidget {
  const MonacoWebView({
    super.key,
    required this.content,
    required this.language,
    this.readOnly = true,
    this.onChanged,
  });

  final String content;
  final String language;
  final bool readOnly;
  final ValueChanged<String>? onChanged;

  @override
  State<MonacoWebView> createState() => _MonacoWebViewState();
}

class _MonacoWebViewState extends State<MonacoWebView> {
  late final WebViewController _controller;
  bool _isReady = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF030014))
      ..addJavaScriptChannel('FlutterBridge', onMessageReceived: _onBridgeMessage)
      ..loadFlutterAsset('assets/monaco/editor.html');
  }

  void _onBridgeMessage(JavaScriptMessage message) {
    final Map<String, dynamic> payload;
    try {
      payload = jsonDecode(message.message) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    switch (payload['type']) {
      case 'ready':
        _isReady = true;
        _pushContent();
        break;
      case 'change':
        widget.onChanged?.call(payload['value'] as String? ?? '');
        break;
    }
  }

  void _pushContent() {
    if (!_isReady) return;
    final encodedValue = jsonEncode(widget.content);
    final encodedLanguage = jsonEncode(widget.language);
    _controller.runJavaScript('setEditorContent($encodedValue, $encodedLanguage);');
    _controller.runJavaScript('setEditorReadOnly(${widget.readOnly});');
  }

  @override
  void didUpdateWidget(covariant MonacoWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.content != widget.content || oldWidget.language != widget.language || oldWidget.readOnly != widget.readOnly) {
      _pushContent();
    }
  }

  @override
  Widget build(BuildContext context) {
    return WebViewWidget(controller: _controller);
  }
}
