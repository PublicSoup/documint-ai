import React from 'react';
import { Link } from 'react-router-dom';
import { Zap, Code, Shield, Sparkles, ArrowRight, Star } from 'lucide-react';

const LandingPage = () => {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Premium Navbar */}
            <nav className="navbar-blur py-4 px-6 sticky top-0 z-50">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse-glow">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold gradient-text">Revascan</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link to="/login" className="text-slate-300 hover:text-white transition-colors px-4 py-2">
                            Sign In
                        </Link>
                        <Link to="/signup" className="btn-glow px-5 py-2.5 text-white rounded-lg font-semibold text-sm flex items-center gap-2">
                            Get Started Free
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center px-4 py-20">
                <div className="max-w-5xl text-center space-y-8">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 badge-glow px-5 py-2 rounded-full animate-float">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm text-indigo-300 font-medium">Enterprise-Grade Code Analysis</span>
                    </div>

                    {/* Title */}
                    <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight leading-none">
                        <span className="gradient-text">Revascan</span>
                    </h1>

                    <p className="text-2xl md:text-3xl text-slate-400 font-light">
                        AI-Powered Code Intelligence
                    </p>

                    {/* Description */}
                    <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
                        Get instant security audits, complexity analysis, and intelligent refactoring suggestions.
                        Built for developers who demand excellence.
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
                        <Link
                            to="/signup"
                            className="btn-glow px-8 py-4 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                        >
                            <Zap className="w-5 h-5" />
                            Start Free Trial
                        </Link>
                        <Link
                            to="/login"
                            className="glass-card px-8 py-4 text-slate-200 rounded-xl font-semibold text-lg hover:border-indigo-500/50 transition-all flex items-center justify-center gap-2"
                        >
                            Sign In
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                    </div>
                </div>

                {/* Features Grid */}
                <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full px-4">
                    <div className="feature-card rounded-2xl p-8">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 flex items-center justify-center mb-6">
                            <Code className="w-7 h-7 text-indigo-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">Deep Analysis</h3>
                        <p className="text-slate-400 leading-relaxed">Cyclomatic complexity scoring with actionable improvement suggestions.</p>
                    </div>

                    <div className="feature-card rounded-2xl p-8">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20 flex items-center justify-center mb-6">
                            <Shield className="w-7 h-7 text-green-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">Security Scanning</h3>
                        <p className="text-slate-400 leading-relaxed">Detect vulnerabilities and security issues before they reach production.</p>
                    </div>

                    <div className="feature-card rounded-2xl p-8">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-600/20 flex items-center justify-center mb-6">
                            <Zap className="w-7 h-7 text-yellow-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">Auto-Refactoring</h3>
                        <p className="text-slate-400 leading-relaxed">One-click PEP-8 formatting and intelligent style improvements.</p>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="navbar-blur py-6 text-center">
                <p className="text-slate-600 text-sm">&copy; 2026 Revascan. Enterprise-grade code analysis.</p>
            </footer>
        </div>
    );
};

export default LandingPage;
