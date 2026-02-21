'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FileText, Search, Filter, Download, Clock, User, Activity, ShieldCheck, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';

interface AuditEntry {
    id: string;
    userId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    details: Record<string, unknown>;
    ip: string | null;
    createdAt: string;
    user?: { name: string | null; email: string } | null;
    hash?: string | null;
    previousHash?: string | null;
}

export default function AdminAuditPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const filterUserId = searchParams.get('userId');

    const [logs, setLogs] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');

    useEffect(() => {
        async function fetchLogs() {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                if (actionFilter) params.set('action', actionFilter);
                if (filterUserId) params.set('userId', filterUserId);

                const res = await fetch(`/api/audit?${params.toString()}`);
                if (!res.ok) throw new Error('Failed to fetch');
                const data = await res.json();
                setLogs(data.logs || data || []);
                setVerificationStatus('idle'); // Reset verification on new fetch
            } catch (err) {
                console.error('Audit fetch error:', err);
                toast.error("Failed to fetch audit logs");
            } finally {
                setLoading(false);
            }
        }
        fetchLogs();
    }, [actionFilter, filterUserId]);

    const verifyIntegrity = async () => {
        setVerificationStatus('verifying');

        try {
            const res = await fetch(`/api/audit/verify?limit=${Math.min(logs.length || 100, 500)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || 'Verification failed');
            }

            if (data.success) {
                setVerificationStatus('valid');
                toast.success(`Chain integrity verified (${data.totalVerified} entries)`);
            } else {
                setVerificationStatus('invalid');
                toast.error(`Integrity check failed (${data.summary?.tamperedCount || 0} tampered entries)`);
            }
        } catch (error) {
            console.error('Audit verify error:', error);
            setVerificationStatus('invalid');
            toast.error('Failed to verify audit chain integrity');
        }
    };

    const clearUserFilter = () => {
        router.push('/admin/audit');
    };

    const filteredLogs = logs.filter((log) => {
        if (!search) return true;
        const term = search.toLowerCase();
        return (
            log.action.toLowerCase().includes(term) ||
            log.entity.toLowerCase().includes(term) ||
            log.user?.email?.toLowerCase().includes(term) ||
            log.user?.name?.toLowerCase().includes(term) ||
            log.ip?.includes(term)
        );
    });

    const uniqueActions = [...new Set(logs.map((l) => l.action))].sort();

    const actionColor = (action: string) => {
        if (action.includes('DELETE') || action.includes('delete')) return 'text-red-400 bg-red-500/10 border-red-500/20';
        if (action.includes('CREATE') || action.includes('create')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (action.includes('UPDATE') || action.includes('update')) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        if (action.includes('LOGIN') || action.includes('login')) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
    };

    const handleExport = async () => {
        try {
            const params = new URLSearchParams();
            if (filterUserId) params.set('userId', filterUserId);
            params.set('format', 'csv');

            const res = await fetch(`/api/audit?${params.toString()}`, { method: 'POST' });
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        } catch (err) {
            console.error('Export error:', err);
            toast.error("Export failed");
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
                        <p className="text-sm text-zinc-500">{filteredLogs.length} events recorded</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={verifyIntegrity}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${verificationStatus === 'valid'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                            }`}
                    >
                        {verificationStatus === 'valid' ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                        {verificationStatus === 'valid' ? 'Verified' : 'Verify Integrity'}
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-zinc-300 hover:bg-white/[0.08] transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="pl-10 pr-8 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-white appearance-none focus:outline-none focus:border-indigo-500/40 transition-colors"
                    >
                        <option value="">All Actions</option>
                        {uniqueActions.map((action) => (
                            <option key={action} value={action}>{action}</option>
                        ))}
                    </select>
                </div>
                {filterUserId && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm">
                        <span>User: {filterUserId.slice(0, 8)}...</span>
                        <button onClick={clearUserFilter} className="hover:text-white"><X className="w-3 h-3" /></button>
                    </div>
                )}
            </div>

            {/* Logs Table */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center">
                        <div className="inline-flex items-center gap-2 text-sm text-zinc-500">
                            <Activity className="w-4 h-4 animate-spin" />
                            Loading audit logs...
                        </div>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="p-12 text-center">
                        <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                        <p className="text-sm text-zinc-500">No audit logs found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    <th className="text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Time</th>
                                    <th className="text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">User</th>
                                    <th className="text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Action</th>
                                    <th className="text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">Entity</th>
                                    <th className="text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-5 py-3">IP</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2 text-xs text-zinc-400">
                                                    <Clock className="w-3 h-3 text-zinc-600" />
                                                    {new Date(log.createdAt).toLocaleString()}
                                                </div>
                                                {log.hash && (
                                                    <div className="text-[10px] text-zinc-700 font-mono" title={log.hash}>
                                                        Hash: {log.hash.slice(0, 8)}...
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <User className="w-3.5 h-3.5 text-zinc-600" />
                                                <span className="text-sm text-zinc-300">
                                                    {log.user?.name || log.user?.email || 'System'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${actionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-sm text-zinc-400">{log.entity}</span>
                                            {log.entityId && (
                                                <span className="text-xs text-zinc-600 ml-1">#{log.entityId.slice(0, 8)}</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="text-xs text-zinc-600 font-mono">{log.ip || '—'}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
