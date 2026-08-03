import 'package:flutter_test/flutter_test.dart';

import 'package:documint_mobile/features/ide/runtime_detect.dart';

// Guards the extension→runtimeKind mapping that gates the IDE Run button and
// the sandbox request. Getting these wrong would either hide Run for a
// supported language or send an unsupported kind the backend rejects.
void main() {
  test('supported languages map to their sandbox runtimeKind', () {
    expect(detectRuntimeKind('main.py'), 'python');
    expect(detectRuntimeKind('index.php'), 'php');
    expect(detectRuntimeKind('server.go'), 'go');
    expect(detectRuntimeKind('App.java'), 'java');
    expect(detectRuntimeKind('main.rs'), 'rust');
    expect(detectRuntimeKind('deploy.sh'), 'shell');
    expect(detectRuntimeKind('setup.bash'), 'shell');
  });

  test('non-sandbox languages return null (Run hidden)', () {
    expect(detectRuntimeKind('app.js'), isNull);
    expect(detectRuntimeKind('app.ts'), isNull);
    expect(detectRuntimeKind('index.html'), isNull);
    expect(detectRuntimeKind('README.md'), isNull);
    expect(detectRuntimeKind('noextension'), isNull);
  });

  test('extension matching is case-insensitive', () {
    expect(detectRuntimeKind('MAIN.PY'), 'python');
  });

  test('runtimeLabel gives human-readable names', () {
    expect(runtimeLabel('python'), 'Python');
    expect(runtimeLabel('shell'), 'Shell');
  });
}
