"use client";

import { useState, useEffect } from "react";
import { Bell, BellDot, X, Check, Trash2, ExternalLink, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface Notification {
    id: string;
    type: string;
    message: string;
    link: string | null;
    read: boolean;
    createdAt: string;
}

export function NotificationCenter() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications);
                setUnreadCount(data.unreadCount);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, []);

    const markAsRead = async (id: string) => {
        try {
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (e) {}
    };

    const markAllRead = async () => {
        try {
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true })
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (e) {}
    };

    const deleteNotification = async (id: string) => {
        try {
            await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
            setNotifications(prev => prev.filter(n => n.id !== id));
            // Unread count is handled by state filter if it was unread
        } catch (e) {}
    };

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2 text-zinc-400 hover:text-white transition-colors"
            >
                {unreadCount > 0 ? (
                    <>
                        <BellDot className="w-5 h-5 text-primary" />
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#030014]">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    </>
                ) : (
                    <Bell className="w-5 h-5" />
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 max-h-[500px] bg-[#0A0A0B] border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <h3 className="font-bold text-sm text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <button 
                                    onClick={markAllRead}
                                    className="text-[10px] font-black uppercase text-primary hover:text-primary/80 transition-colors"
                                >
                                    Mark all as read
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[200px]">
                            {loading ? (
                                <div className="p-12 flex justify-center">
                                    <Loader2 className="w-5 h-5 animate-spin text-zinc-700" />
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="p-12 text-center space-y-2">
                                    <Bell className="w-8 h-8 text-zinc-800 mx-auto" />
                                    <p className="text-xs text-zinc-500 italic">No notifications yet.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {notifications.map((n) => (
                                        <div 
                                            key={n.id} 
                                            className={cn(
                                                "p-4 hover:bg-white/[0.02] transition-all group relative",
                                                !n.read && "bg-primary/[0.03]"
                                            )}
                                        >
                                            {!n.read && (
                                                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-full" />
                                            )}
                                            
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{n.type}</span>
                                                    <span className="text-[9px] text-zinc-600 flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                
                                                <p className="text-xs text-white/80 leading-relaxed pr-6">
                                                    {/* We could use a small markdown parser or just simple dangerouslySetInnerHTML for the bold parts */}
                                                    <span dangerouslySetInnerHTML={{ __html: n.message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                                </p>

                                                <div className="flex items-center gap-3 mt-2">
                                                    {n.link && (
                                                        <Link 
                                                            href={n.link}
                                                            onClick={() => {
                                                                markAsRead(n.id);
                                                                setOpen(false);
                                                            }}
                                                            className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline"
                                                        >
                                                            View <ExternalLink className="w-2.5 h-2.5" />
                                                        </Link>
                                                    )}
                                                    {!n.read && (
                                                        <button 
                                                            onClick={() => markAsRead(n.id)}
                                                            className="text-[10px] font-bold text-emerald-500 flex items-center gap-1 hover:underline"
                                                        >
                                                            <Check className="w-2.5 h-2.5" /> Done
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <button 
                                                onClick={() => deleteNotification(n.id)}
                                                className="absolute top-4 right-4 p-1 rounded-lg text-zinc-700 hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-3 bg-white/[0.02] border-t border-white/10 text-center">
                            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Secure Comm Channel v2.1</p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
