import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CodeEditor from '../components/CodeEditor';
import AnalysisPanel from '../components/AnalysisPanel';
import { useAuth } from '../context/AuthContext';
import { analyzeApi } from '../api/client';
import { Play, LogOut, User, ChevronDown, Sparkles, Zap } from 'lucide-react';

const AppPage = () => {
    const [code, setCode] = useState(`# Welcome to Revascan
# Paste your code and run analysis!
# Language is auto-detected ✨

def fibonacci(n):
    """Calculate fibonacci sequence"""
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Try running analysis on this code
result = fibonacci(10)
print(f"Fibonacci(10) = {result}")
`);
    const [language, setLanguage] = useState('python');
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);

    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleAnalyze = async () => {
        setIsLoading(true);
        try {
            const data = await analyzeApi.analyze(code, language);
            setResults(data);
        } catch (error) {
            console.error(error);
            alert('Analysis failed: ' + (error.response?.data?.detail || error.message));
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            {/* Premium Navbar */}
            <header className="h-16 navbar-blur flex items-center justify-between px-6 z-50">
                <div className="flex items-center gap-3">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold gradient-text">Revascan</span>
                    </Link>
                    <span className="badge-glow text-xs px-3 py-1 rounded-full text-indigo-400 font-medium">
                        AI Powered
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleAnalyze}
                        disabled={isLoading}
                        className="btn-glow flex items-center gap-2 px-5 py-2.5 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                Run Analysis
                            </>
                        )}
                    </button>

                    {/* User Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="flex items-center gap-2 px-3 py-2 glass-card rounded-lg text-sm transition-all hover:border-indigo-500/30"
                        >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <User className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-slate-200 max-w-[140px] truncate hidden sm:block">{user?.email}</span>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                        </button>

                        {showUserMenu && (
                            <div className="absolute right-0 mt-2 w-56 glass-card rounded-xl shadow-2xl py-2 z-50 border border-slate-700/50">
                                <div className="px-4 py-3 border-b border-slate-700/50">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider">Signed in as</p>
                                    <p className="text-sm text-white truncate mt-1 font-medium">{user?.email}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 capitalize">
                                            {user?.role} Plan
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex overflow-hidden">
                {/* Editor Pane */}
                <div className="w-1/2 p-4 flex flex-col min-w-[400px]">
                    <div className="flex-1 glass-card rounded-xl overflow-hidden">
                        <CodeEditor
                            code={code}
                            onChange={setCode}
                            language={language}
                            onLanguageChange={setLanguage}
                        />
                    </div>
                </div>

                {/* Glowing Divider */}
                <div className="w-px split-divider"></div>

                {/* Results Pane */}
                <div className="w-1/2 p-4 overflow-hidden flex flex-col min-w-[300px]">
                    <div className="flex-1 glass-card rounded-xl p-6 overflow-hidden">
                        <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="w-5 h-5 text-indigo-400" />
                            <h2 className="text-lg font-semibold text-white">AI Analysis</h2>
                        </div>
                        <div className="h-[calc(100%-3rem)] overflow-y-auto">
                            <AnalysisPanel results={results} isLoading={isLoading} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AppPage;
