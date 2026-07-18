import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/api_exception.dart';
import '../api/providers.dart';
import '../theme/app_theme.dart';

/// The reset email links to a *web* URL (src/lib/email.ts templates), so
/// `initialToken` only arrives here via the `documint://reset-password?token=`
/// deep link — otherwise the user pastes the code from the email manually.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, this.initialToken});

  final String? initialToken;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  late final _tokenController = TextEditingController(text: widget.initialToken ?? '');
  final _passwordController = TextEditingController();
  String? _message;
  String? _error;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _tokenController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _message = null;
      _error = null;
      _isSubmitting = true;
    });

    try {
      final message = await ref.read(authRepositoryProvider).confirmPasswordReset(
            token: _tokenController.text.trim(),
            password: _passwordController.text,
          );
      setState(() => _message = message);
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (mounted) context.go('/login');
      });
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _tokenController.text.isNotEmpty && _passwordController.text.isNotEmpty && !_isSubmitting;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Set a new password', style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                Text('Paste the reset code from your email.', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
                const SizedBox(height: 32),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        TextField(
                          controller: _tokenController,
                          decoration: const InputDecoration(labelText: 'Reset code', hintText: 'Paste code from email'),
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _passwordController,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: 'New password', hintText: 'At least 8 characters'),
                          onChanged: (_) => setState(() {}),
                        ),
                        if (_message != null) ...[
                          const SizedBox(height: 16),
                          Text(_message!, textAlign: TextAlign.center),
                        ],
                        if (_error != null) ...[
                          const SizedBox(height: 16),
                          Text(_error!, style: const TextStyle(color: AppColors.destructive), textAlign: TextAlign.center),
                        ],
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: canSubmit ? _submit : null,
                            child: _isSubmitting
                                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primaryForeground))
                                : const Text('Reset Password'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                TextButton(onPressed: () => context.go('/login'), child: const Text('Back to sign in')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
