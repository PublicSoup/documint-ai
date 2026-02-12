'use client';

import React, { useEffect, useState } from 'react';
import { Users, CreditCard, FileText, Activity, TrendingUp, Shield } from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
    totalUsers: number;
    activeSubscriptions: number;
    totalFiles: number;
    recentActivity: number;
}

interface UserSummary {
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
    subscription?: { plan: string; status: string } | null;
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<DashboardStats>({ totalUsers: 0, activeSubscriptions: 0, totalFiles: 0, recentActivity: 0 });
    const [recentUsers, setRecentUsers] = useState<UserSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch('/api/admin/users');
                if (!res.ok) throw new Error('Failed to fetch');
                const users = await res.json();

                const activeSubscriptions = users.filter((u: any) => u.subscription?.status === 'active').length;
                const totalFiles = users.reduce((acc: number, u: any) => acc + (u._count?.files || 0), 0);
                const recentActivity = users.reduce((acc: number, u: any) => acc + (u._count?.auditLogs || 0), 0);

                setStats({
                    totalUsers: users.length,
                    activeSubscriptions,
                    totalFiles,
                    recentActivity,
                });

                // Get 5 most recent users
                const sorted = [...users].sort((a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setRecentUsers(sorted.slice(0, 5));
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const statCards = [
        { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'from-blue-500 to-cyan-500', href: '/admin/users' },
        { label: 'Active Plans', value: stats.activeSubscriptions, icon: CreditCard, color: 'from-emerald-500 to-green-500' },
        { label: 'Total Files', value: stats.totalFiles, icon: FileText, color: 'from-purple-500 to-pink-500' },
        { label: 'Audit Events', value: stats.recentActivity, icon: Activity, color: 'from-amber-500 to-orange-500', href: '/admin/audit' },
    ];

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                        <p className="text-sm text-zinc-500">Loading system overview...</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-32 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                    <p className="text-sm text-zinc-500">System overview and quick actions</p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => {
                    const content = (
                        <div
                            key={card.label}
                            className="relative overflow-hidden rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 hover:bg-white/[0.05] transition-colors group"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{card.label}</p>
                                    <p className="text-3xl font-bold text-white mt-1">{card.value.toLocaleString()}</p>
                                </div>
                                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center opacity-80`}>
                                    <card.icon className="w-5 h-5 text-white" />
                                </div>
                            </div>
                            <div className="flex items-center gap-1 mt-3 text-xs text-zinc-500">
                                <TrendingUp className="w-3 h-3" />
                                All time
                            </div>
                        </div>
                    );

                    return card.href ? (
                        <Link key={card.label} href={card.href} className="block">
                            {content}
                        </Link>
                    ) : (
                        <div key={card.label}>{content}</div>
                    );
                })}
            </div>

            {/* Recent Users */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <h2 className="text-sm font-semibold text-white">Recent Users</h2>
                    <Link href="/admin/users" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                        View all →
                    </Link>
                </div>
                <div className="divide-y divide-white/[0.04]">
                    {recentUsers.map((user) => (
                        <div key={user.id} className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
                                    <span className="text-xs font-medium text-indigo-400">
                                        {(user.name || user.email)?.[0]?.toUpperCase() || '?'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-zinc-200">{user.name || 'No name'}</p>
                                    <p className="text-xs text-zinc-500">{user.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {user.subscription?.plan && (
                                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${user.subscription.plan === 'pro'
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : user.subscription.plan === 'team'
                                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                        }`}>
                                        {user.subscription.plan}
                                    </span>
                                )}
                                <span className="text-xs text-zinc-600">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                    {recentUsers.length === 0 && (
                        <div className="px-5 py-8 text-center text-sm text-zinc-500">No users found</div>
                    )}
                </div>
            </div>
        </div>
    );
}
