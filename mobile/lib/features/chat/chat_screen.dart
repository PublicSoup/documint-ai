import 'package:flutter/material.dart';

import '../../widgets/coming_soon.dart';

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chat')),
      body: const ComingSoon(
        title: 'AI Chat',
        description: 'Streaming AI chat and agent sessions are landing in the next update.',
        icon: Icons.smart_toy_outlined,
      ),
    );
  }
}
