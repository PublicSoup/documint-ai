'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, Shield, BarChart3, FileText, ArrowLeft } from 'lucide-react';
import { useSession } from 'next-auth/react';

const navItems = [
    { href: '/admin', label: 'Dashboard', icon: BarChart3, exact: true },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/audit', label: 'Audit Logs', icon: FileText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, status } = useSession();

    useEffect(() => {
        if (status === 'loading') return;
        if (!session || session.user?.email !== 'admin@documintai.dev') {
            router.push('/');
        }
    }, [session, status, router]);

    const isActive = (href: string, exact?: boolean) => {
        if (exact) return pathname === href;
        return pathname.startsWith(href);
    };

    if (status === 'loading') {
        return <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center text-white">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-[#0A0A0B] flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/[0.06] bg-black/40 backdrop-blur-xl flex flex-col">
                {/* Logo area */}
                <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/[0.06]">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <span className="font-semibold text-white text-sm tracking-tight">Admin Panel</span>
                        <p className="text-[10px] text-zinc-500 -mt-0.5">DocuMint AI</p>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1">
                    {navItems.map((item) => {
                        const active = isActive(item.href, item.exact);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${active
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
                                    }`}
                            >
                                <item.icon className={`w-4 h-4 ${active ? 'text-indigo-400' : 'text-zinc-500'}`} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Bottom */}
                <div className="p-3 border-t border-white/[0.06]">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Link>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto">
                <div className="max-w-6xl mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
