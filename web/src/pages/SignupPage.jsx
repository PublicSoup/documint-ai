import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, UserPlus, AlertCircle, Check, Sparkles, ArrowLeft } from 'lucide-react';

const SignupPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { signup } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            await signup(email, password);
            navigate('/app', { replace: true });
        } catch (err) {
            setError(err.response?.data?.detail || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full space-y-8">
                {/* Back Link */}
                <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
                    <ArrowLeft className="w-4 h-4" />
                    Back to home
                </Link>

                {/* Logo */}
                <div className="text-center space-y-3">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-pulse-glow mx-auto">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold gradient-text">Create account</h1>
                    <p className="text-slate-500">Start your free trial today</p>
                </div>

                {/* Form Card */}
                <div className="glass-card rounded-2xl p-8">
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="input-glow w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none text-white placeholder-slate-500"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="input-glow w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none text-white placeholder-slate-500"
                                    placeholder="••••••••"
                                />
                            </div>
                            <p className="mt-2 text-xs text-slate-500">Minimum 8 characters</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="input-glow w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none text-white placeholder-slate-500"
                                    placeholder="••••••••"
                                />
                                {confirmPassword && password === confirmPassword && (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-green-400" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-glow w-full flex items-center justify-center gap-2 py-4 text-white rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                        >
                            {loading ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            ) : (
                                <>
                                    <UserPlus className="w-5 h-5" />
                                    Create Account
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <span className="text-slate-500">Already have an account? </span>
                        <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                            Sign in
                        </Link>
                    </div>
                </div>

                {/* Trust Badge */}
                <p className="text-center text-xs text-slate-600">
                    By signing up, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
};

export default SignupPage;
