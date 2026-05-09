
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditUserDialog } from '@/components/admin/edit-user-dialog';
import { Trash2, Edit, Search, UserX, Loader2, ShieldAlert, KeyRound, Copy, Check, FileText } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

import { toast } from 'sonner';

interface User {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    subscription: {
        plan: string;
        status: string;
    } | null;
    _count: {
        files: number;
        auditLogs: number;
    }
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const router = useRouter();

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/admin/users');
            if (res.status === 401) {
                router.push('/');
                return;
            }
            const data = await res.json();
            if (!data.users) {
                console.error("Unexpected API response format:", data);
                return;
            }
            setUsers(data.users);
        } catch (error) {
            toast.error("Failed to fetch users");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to PERMANENTLY delete this user? This action cannot be undone.")) return;

        try {
            const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast.success("User deleted");
                setUsers(users.filter(u => u.id !== id));
            } else {
                toast.error("Failed to delete user");
            }
        } catch (e) {
            toast.error("Error deleting user");
        }
    };

    const handleUpdate = async (id: string, data: { name: string; email: string; password?: string }) => {
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                toast.success("User updated");
                fetchUsers(); // Refresh to get latest data
            } else {
                toast.error("Update failed");
            }
        } catch (e) {
            toast.error("Error updating user");
        }
    };

    const handleResetPassword = async (user: User) => {
        if (!confirm(`Are you sure you want to reset the password for ${user.email}?`)) return;

        try {
            const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
                method: 'POST'
            });

            if (res.ok) {
                const data = await res.json();
                setResetResult({ email: user.email || '', password: data.password });
                toast.success("Password reset successfully");
            } else {
                toast.error("Failed to reset password");
            }
        } catch (e) {
            toast.error("Error resetting password");
        }
    };

    const copyToClipboard = () => {
        if (resetResult) {
            navigator.clipboard.writeText(resetResult.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success("Password copied to clipboard");
        }
    };

    const filteredUsers = users.filter(user =>
        (user.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center bg-black text-white"><Loader2 className="animate-spin w-8 h-8" /></div>;
    }

    return (
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-3">
                            <ShieldAlert className="text-amber-500 w-8 h-8" />
                            Admin Console
                        </h1>
                        <p className="text-zinc-400 mt-2">Manage users, access controls, and system health.</p>
                    </div>
                    <div className="relative w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
                        <Input
                            placeholder="Search users by name or email..."
                            className="bg-zinc-900 border-zinc-800 pl-10"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
                    <Table>
                        <TableHeader className="bg-zinc-900">
                            <TableRow className="border-zinc-800 hover:bg-zinc-900">
                                <TableHead className="text-zinc-400">User</TableHead>
                                <TableHead className="text-zinc-400">Status</TableHead>
                                <TableHead className="text-zinc-400">Subscription</TableHead>
                                <TableHead className="text-zinc-400">Stats</TableHead>
                                <TableHead className="text-right text-zinc-400">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.map((user) => (
                                <TableRow key={user.id} className="border-zinc-800 hover:bg-zinc-900/50">
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-white">{user.name || 'Unnamed'}</span>
                                            <span className="text-xs text-zinc-500 font-mono">{user.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${user.email?.includes('admin') ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                                            {user.email?.includes('admin') ? 'ADMIN' : 'ACTIVE'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-xs">
                                            <div className="text-zinc-300 capitalize">{user.subscription?.plan || 'Free'}</div>
                                            <div className="text-zinc-500">{user.subscription?.status || 'Inactive'}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-4 text-xs text-zinc-400">
                                            <span>{user._count.files} Files</span>
                                            <span>{user._count.auditLogs} Logs</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 h-8 w-8 p-0"
                                                onClick={() => setEditingUser(user)}
                                                title="Edit User"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-8 w-8 p-0"
                                                title="Reset Password"
                                                onClick={() => handleResetPassword(user)}
                                            >
                                                <KeyRound className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 w-8 p-0"
                                                title="View Logs"
                                                onClick={() => router.push(`/admin/audit?userId=${user.id}`)}
                                            >
                                                <FileText className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                                                onClick={() => handleDelete(user.id)}
                                                title="Delete User"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <EditUserDialog
                    open={!!editingUser}
                    onOpenChange={(open) => !open && setEditingUser(null)}
                    user={editingUser}
                    onSave={handleUpdate}
                />
            </div>

            {/* Password Reset Result Dialog */}
            <Dialog open={!!resetResult} onOpenChange={(open) => !open && setResetResult(null)}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <KeyRound className="w-5 h-5 text-amber-500" />
                            Password Reset Successful
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            The password for <strong>{resetResult?.email}</strong> has been reset.
                            <br />
                            Please copy this password immediately. It will not be shown again.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center space-x-2 mt-4">
                        <div className="grid flex-1 gap-2">
                            <div className="relative">
                                <Input
                                    readOnly
                                    value={resetResult?.password || ''}
                                    className="pr-10 font-mono text-lg bg-black/50 border-zinc-700 text-amber-500 selection:bg-amber-500/30"
                                />
                                <Button
                                    size="sm"
                                    className="absolute right-1 top-1 h-8 w-8 p-0 bg-transparent hover:bg-zinc-800"
                                    onClick={copyToClipboard}
                                >
                                    {copied ? (
                                        <Check className="h-4 w-4 text-emerald-500" />
                                    ) : (
                                        <Copy className="h-4 w-4 text-zinc-400" />
                                    )}
                                    <span className="sr-only">Copy</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="sm:justify-start">
                        <Button
                            type="button"
                            variant="secondary"
                            className="bg-zinc-800 hover:bg-zinc-700 text-white w-full"
                            onClick={() => setResetResult(null)}
                        >
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
