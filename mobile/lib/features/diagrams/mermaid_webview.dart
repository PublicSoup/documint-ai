import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../theme/app_theme.dart';

/// Renders Mermaid source in a WebView using the bundled
/// `assets/diagram/mermaid.html` page. Same JS<->Dart bridge pattern as the
/// Monaco editor: Dart calls `renderDiagram(...)` via `runJavaScript`, the
/// page posts `{type: 'ready' | 'rendered' | 'error'}` back over the
/// `FlutterBridge` channel.
class MermaidWebView extends StatefulWidget {
  const MermaidWebView({super.key, required this.code});

  final String code;

  @override
  State<MermaidWebView> createState() => _MermaidWebViewState();
}

class _MermaidWebViewState extends State<MermaidWebView> {
  late final WebViewController _controller;
  bool _isReady = false;
  bool _isRendering = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.ideBackground)
      ..addJavaScriptChannel('FlutterBridge', onMessageReceived: _onBridgeMessage)
      ..loadFlutterAsset('assets/diagram/mermaid.html');
  }

  void _onBridgeMessage(JavaScriptMessage message) {
    Map<String, dynamic> payload;
    try {
      final decoded = jsonDecode(message.message);
      if (decoded is! Map<String, dynamic>) return;
      payload = decoded;
    } catch (_) {
      return;
    }

    switch (payload['type']) {
      case 'ready':
        _isReady = true;
        _render();
        break;
      case 'rendered':
      case 'error':
        if (mounted) setState(() => _isRendering = false);
        break;
    }
  }

  void _render() {
    if (!_isReady) return;
    if (mounted) setState(() => _isRendering = true);
    _controller.runJavaScript('renderDiagram(${jsonEncode(widget.code)});');
  }

  @override
  void didUpdateWidget(covariant MermaidWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.code != widget.code) _render();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(controller: _controller),
        if (_isRendering) const Center(child: CircularProgressIndicator()),
      ],
    );
  }
}
