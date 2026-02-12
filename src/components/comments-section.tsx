"use client";

import { useState, useEffect } from "react";
import { Send, User as UserIcon, Loader2, MessageSquare, Reply } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    user: {
        name: string | null;
        image: string | null;
    };
    replies: Comment[];
}

export default function CommentsSection({ fileId }: { fileId: string }) {
    const { data: session } = useSession();
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState("");
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState<string | null>(null);

    const fetchComments = async () => {
        try {
            const res = await fetch(`/api/comments?fileId=${fileId}`);
            if (res.ok) {
                const data = await res.json();
                setComments(data.comments);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComments();

        // Poll for new comments every 5 seconds (Real-time update)
        const interval = setInterval(() => {
            fetchComments();
        }, 5000);

        return () => clearInterval(interval);
    }, [fileId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        setSending(true);
        try {
            const res = await fetch("/api/comments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content: newComment,
                    fileId,
                    parentId: replyTo
                }),
            });

            if (res.ok) {
                setNewComment("");
                setReplyTo(null);
                fetchComments(); // Refresh list
            }
        } catch (error) {
            console.error(error);
        } finally {
            setSending(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>;

    return (
        <div className="bg-gray-50 border-t border-gray-200 mt-8 -mx-8 -mb-8 rounded-b-xl overflow-hidden">
            <div className="p-6 bg-white border-b">
                <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-gray-500" />
                    Comments
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{comments.reduce((acc, c) => acc + 1 + c.replies.length, 0)}</span>
                </h3>
            </div>

            <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto">
                {comments.length === 0 ? (
                    <p className="text-center text-gray-500 py-8 italic">No comments yet. Start the discussion!</p>
                ) : (
                    comments.map(comment => (
                        <div key={comment.id} className="space-y-4">
                            {/* Parent Comment */}
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    {comment.user.image ? (
                                        <Image src={comment.user.image} alt={comment.user.name || ""} width={32} height={32} className="w-8 h-8 rounded-full" />
                                    ) : (
                                        <span className="font-bold text-blue-600 text-xs">{(comment.user.name || "U")[0]}</span>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-sm text-zinc-100">{comment.user.name || "Unknown"}</span>
                                        <span className="text-xs text-gray-400">{formatDate(comment.createdAt)}</span>
                                    </div>
                                    <p className="text-gray-700 text-sm leading-relaxed">{comment.content}</p>
                                    <button
                                        onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                                        className="text-xs text-gray-500 hover:text-blue-600 mt-2 font-medium flex items-center gap-1"
                                    >
                                        <Reply className="w-3 h-3" /> Reply
                                    </button>
                                </div>
                            </div>

                            {/* Replies */}
                            {comment.replies.length > 0 && (
                                <div className="ml-11 space-y-4 border-l-2 pl-4 border-gray-100">
                                    {comment.replies.map(reply => (
                                        <div key={reply.id} className="flex gap-3">
                                            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                                                {reply.user.image ? (
                                                    <Image src={reply.user.image} alt={reply.user.name || ""} width={24} height={24} className="w-6 h-6 rounded-full" />
                                                ) : (
                                                    <span className="font-bold text-purple-600 text-[10px]">{(reply.user.name || "U")[0]}</span>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-semibold text-xs text-zinc-100">{reply.user.name}</span>
                                                    <span className="text-[10px] text-gray-400">{formatDate(reply.createdAt)}</span>
                                                </div>
                                                <p className="text-gray-700 text-sm">{reply.content}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Reply Input */}
                            {replyTo === comment.id && (
                                <form onSubmit={handleSubmit} className="ml-11 flex gap-2">
                                    <input
                                        type="text"
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Write a reply..."
                                        className="flex-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        disabled={sending}
                                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </form>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Main Input */}
            {!replyTo && (
                <div className="p-4 bg-white border-t">
                    <form onSubmit={handleSubmit} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            {session?.user?.image ? (
                                <Image src={session.user.image} alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
                            ) : (
                                <UserIcon className="w-4 h-4 text-gray-400" />
                            )}
                        </div>
                        <div className="flex-1 flex gap-2">
                            <input
                                type="text"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Add a comment..."
                                className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button
                                type="submit"
                                disabled={sending || !newComment.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
