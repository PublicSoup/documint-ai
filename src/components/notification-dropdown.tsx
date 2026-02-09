"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";

interface Notification {
    id: string;
    message: string;
    type: string;
    read: boolean;
    createdAt: string;
    link?: string;
}

export function NotificationDropdown() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

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
        }
    };

    // Poll for notifications every 60 seconds
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const markAsRead = async (id?: string) => {
        setLoading(true);
        try {
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(id ? { id } : { readAll: true })
            });
            await fetchNotifications();
        } finally {
            setLoading(false);
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
            await markAsRead(notification.id);
        }
        if (notification.link) {
            setIsOpen(false);
            router.push(notification.link);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white hover:bg-white/10 rounded-full relative"
                onClick={() => setIsOpen(!isOpen)}
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-black animate-pulse"></span>
                )}
            </Button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#0A0A0B]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-semibold text-white">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => markAsRead()}
                                disabled={loading}
                                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                            >
                                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                No notifications yet
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {notifications.map((n) => (
                                    <div
                                        key={n.id}
                                        onClick={() => handleNotificationClick(n)}
                                        className={`p-4 hover:bg-white/5 transition-colors cursor-pointer flex gap-3 ${!n.read ? "bg-white/[0.02]" : ""}`}
                                    >
                                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${!n.read ? "bg-blue-500" : "bg-transparent"}`} />
                                        <div className="space-y-1">
                                            <p className={`text-sm ${!n.read ? "text-white font-medium" : "text-white/60"}`}>
                                                {n.message}
                                            </p>
                                            <p className="text-[10px] text-white/40">
                                                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
