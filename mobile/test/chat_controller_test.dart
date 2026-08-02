import 'package:flutter_test/flutter_test.dart';

import 'package:documint_mobile/api/api_client.dart';
import 'package:documint_mobile/api/models/chat_message.dart';
import 'package:documint_mobile/api/repositories/chat_repository.dart';
import 'package:documint_mobile/features/chat/chat_controller.dart';

// Exercises the NDJSON event dispatch in isolation (no network): feed raw
// agent-event lines through the controller's line handler and assert the
// resulting ChatMessage state. This is the highest-value guard given the
// stream parser can't be tested on a device in this environment.
void main() {
  late ChatController controller;

  setUp(() {
    controller = ChatController(ChatRepository(ApiClient.instance));
  });

  ChatMessage newAssistant() => ChatMessage(id: 'a1', role: 'assistant', isStreaming: true);

  test('session_meta captures the session id', () {
    final assistant = newAssistant();
    controller.handleLineForTest('{"type":"session_meta","sessionId":"sess-123","title":"Hi"}', assistant);
    expect(controller.sessionId, 'sess-123');
  });

  test('response events concatenate into assistant content', () {
    final assistant = newAssistant();
    controller.handleLineForTest('{"type":"response","content":"Hello, "}', assistant);
    controller.handleLineForTest('{"type":"response","content":"world"}', assistant);
    expect(assistant.content, 'Hello, world');
  });

  test('thought and tool_call become thinking steps', () {
    final assistant = newAssistant();
    controller.handleLineForTest('{"type":"thought","content":"Let me check"}', assistant);
    controller.handleLineForTest('{"type":"tool_call","tool":"read_file","args":"{}"}', assistant);
    expect(assistant.steps.length, 2);
    expect(assistant.steps[0].type, 'thought');
    expect(assistant.steps[1].toolName, 'read_file');
  });

  test('preview_ready sets the preview url', () {
    final assistant = newAssistant();
    controller.handleLineForTest('{"type":"preview_ready","url":"https://x.vercel.run","timestamp":1}', assistant);
    expect(assistant.previewUrl, 'https://x.vercel.run');
  });

  test('error events flag the message and append the text', () {
    final assistant = newAssistant();
    controller.handleLineForTest('{"type":"error","message":"boom"}', assistant);
    expect(assistant.isError, isTrue);
    expect(assistant.content, contains('boom'));
  });

  test('malformed or non-JSON lines are ignored without throwing', () {
    final assistant = newAssistant();
    expect(() => controller.handleLineForTest('not json', assistant), returnsNormally);
    expect(() => controller.handleLineForTest('', assistant), returnsNormally);
    expect(() => controller.handleLineForTest('[1,2,3]', assistant), returnsNormally);
    expect(assistant.content, isEmpty);
  });
}
