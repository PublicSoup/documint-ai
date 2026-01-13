import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Key, Copy, Trash2, AlertCircle, Check, Sparkles, ArrowLeft, Shield, Code, Terminal } from 'lucide-react';

const SettingsPage = () => {
    const { user } = useAuth();
    const [apiKeyStatus, setApiKeyStatus] = useState(null);
    const [newApiKey, setNewApiKey] = useState(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchApiKeyStatus();
    }, []);

    const fetchApiKeyStatus = async () => {
        try {
            const response = await api.get('/apikeys/status');
            setApiKeyStatus(response.data);
        } catch (err) {
            console.error('Failed to fetch API key status:', err);
        }
    };

    const generateApiKey = async () => {
        setLoading(true);
        setError('');
        setNewApiKey(null);

        try {
            const response = await api.post('/apikeys/generate');
            setNewApiKey(response.data.api_key);
            setApiKeyStatus({ has_api_key: true, created_at: response.data.created_at });
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to generate API key');
        } finally {
            setLoading(false);
        }
    };

    const revokeApiKey = async () => {
        if (!confirm('Are you sure you want to revoke your API key? This cannot be undone.')) {
            return;
        }

        setLoading(true);
        setError('');

        try {
            await api.delete('/apikeys/revoke');
            setApiKeyStatus({ has_api_key: false, created_at: null });
            setNewApiKey(null);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to revoke API key');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(newApiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen py-12 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link to="/app" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Editor
                    </Link>
                    <h1 className="text-3xl font-bold text-white">Settings</h1>
                    <p className="text-slate-400 mt-1">Manage your account and API access</p>
                </div>

                {/* Account Info */}
                <div className="glass-card rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-400" />
                        Account
                    </h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-slate-500">Email</p>
                            <p className="text-white font-medium">{user?.email}</p>
                        </div>
                        <div>
                            <p className="text-slate-500">Plan</p>
                            <p className="text-indigo-400 font-medium capitalize">{user?.role || 'Free'}</p>
                        </div>
                    </div>
                </div>

                {/* API Key Section */}
                <div className="glass-card rounded-xl p-6 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Key className="w-5 h-5 text-yellow-400" />
                        API Key
                    </h2>

                    <p className="text-slate-400 text-sm mb-6">
                        Use your API key to integrate Revascan into your CLI tools, CI/CD pipelines, or custom applications.
                    </p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    {/* New API Key Display */}
                    {newApiKey && (
                        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                            <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-2">
                                <Check className="w-4 h-4" />
                                API Key Generated Successfully
                            </div>
                            <p className="text-yellow-300 text-xs mb-3">
                                ⚠️ Copy this key now! It won't be shown again.
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-4 py-3 bg-slate-900 rounded-lg text-green-400 font-mono text-sm overflow-x-auto">
                                    {newApiKey}
                                </code>
                                <button
                                    onClick={copyToClipboard}
                                    className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    {copied ? (
                                        <Check className="w-5 h-5 text-green-400" />
                                    ) : (
                                        <Copy className="w-5 h-5 text-slate-400" />
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* API Key Status */}
                    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl mb-4">
                        <div>
                            <p className="text-white font-medium">
                                {apiKeyStatus?.has_api_key ? 'Active API Key' : 'No API Key'}
                            </p>
                            {apiKeyStatus?.created_at && (
                                <p className="text-slate-500 text-xs mt-1">
                                    Created: {new Date(apiKeyStatus.created_at).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {apiKeyStatus?.has_api_key ? (
                                <>
                                    <button
                                        onClick={generateApiKey}
                                        disabled={loading}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                    >
                                        Regenerate
                                    </button>
                                    <button
                                        onClick={revokeApiKey}
                                        disabled={loading}
                                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Revoke
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={generateApiKey}
                                    disabled={loading}
                                    className="btn-glow px-4 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Key className="w-4 h-4" />
                                    {loading ? 'Generating...' : 'Generate API Key'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Quick Integration Guide */}
                <div className="glass-card rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Code className="w-5 h-5 text-green-400" />
                        Quick Start
                    </h2>

                    <div className="space-y-4">
                        <div className="p-4 bg-slate-900 rounded-lg">
                            <p className="text-slate-400 text-xs mb-2 flex items-center gap-2">
                                <Terminal className="w-4 h-4" />
                                cURL Example
                            </p>
                            <pre className="text-green-400 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                                {`curl -X POST "https://api.documint.ai/api/v1/analyze" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"code": "print(hello)", "language": "python"}'`}
                            </pre>
                        </div>

                        <a
                            href="/API_INTEGRATION.md"
                            target="_blank"
                            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1"
                        >
                            View Full Documentation →
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
