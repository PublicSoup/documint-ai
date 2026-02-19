"use client";

import { useState, useEffect } from "react";
import { Bell, Info, MessageSquare, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

interface Notification {
    id: string;
    type: string;
    message: string;
    link: string | null;
    read: boolean;
    createdAt: string;
}

export default function NotificationsBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();

    const fetchNotifications = async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications);
                setUnreadCount(data.unreadCount);
            }
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            void fetchNotifications();
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const markRead = async (ids: string[] | "all") => {
        try {
            await fetch("/api/notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notificationIds: ids }),
            });
            await fetchNotifications();
        } catch (error) {
            console.error(error);
        }
    };

    const handleNotificationClick = async (n: Notification) => {
        if (!n.read) {
            await markRead([n.id]);
        }
        setIsOpen(false);
        if (n.link) router.push(n.link);
    };

    const toggleOpen = () => {
        const nextOpen = !isOpen;
        setIsOpen(nextOpen);
        if (nextOpen) {
            void fetchNotifications();
        }
    };

    return (
        <div className="relative">
            <button
                onClick={toggleOpen}
                className="relative p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                title="Notifications"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="font-semibold text-zinc-100 text-sm">Notifications</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={() => {
                                        void markRead("all");
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">
                                    No notifications yet
                                </div>
                            ) : (
                                <div>
                                    {notifications.map(n => (
                                        <div
                                            key={n.id}
                                            onClick={() => {
                                                void handleNotificationClick(n);
                                            }}
                                            className={`p-4 border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors flex gap-3 ${!n.read ? 'bg-blue-50/50' : ''}`}
                                        >
                                            <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${n.type === 'MENTION' ? 'bg-purple-100 text-purple-600' :
                                                n.type === 'COMMENT' ? 'bg-blue-100 text-blue-600' :
                                                    'bg-gray-100 text-gray-600'
                                                }`}>
                                                {n.type === 'MENTION' ? <UserPlus className="w-4 h-4" /> :
                                                    n.type === 'COMMENT' ? <MessageSquare className="w-4 h-4" /> :
                                                        <Info className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <p className={`text-sm ${!n.read ? 'font-medium text-zinc-100' : 'text-gray-600'}`}>
                                                    {n.message}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {new Date(n.createdAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            {!n.read && (
                                                <div className="flex-shrink-0 mt-2">
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
