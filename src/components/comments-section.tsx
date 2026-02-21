"use client";

import { useState, useEffect } from "react";
import { Send, User as UserIcon, Loader2, MessageSquare, Reply, X, Check } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Button } from "./ui/button";

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    userId: string;
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
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");

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

        // Poll for new comments every 10 seconds (Real-time update)
        const interval = setInterval(() => {
            fetchComments();
        }, 10000);

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

    const handleEdit = async (id: string) => {
        if (!editContent.trim()) return;

        setSending(true);
        try {
            const res = await fetch("/api/comments", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, content: editContent }),
            });

            if (res.ok) {
                setEditingCommentId(null);
                setEditContent("");
                fetchComments();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this comment?")) return;

        try {
            const res = await fetch(`/api/comments?id=${id}`, {
                method: "DELETE",
            });

            if (res.ok) {
                fetchComments();
            }
        } catch (error) {
            console.error(error);
        }
    };

    if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-zinc-700" /></div>;

    const totalComments = comments.reduce((acc, c) => acc + 1 + c.replies.length, 0);

    return (
        <div className="mt-12 bg-white/[0.02] border border-white/5 rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="p-6 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                        <MessageSquare className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-zinc-100">Project Discussion</h3>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                            {totalComments} {totalComments === 1 ? 'Message' : 'Messages'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-600 bg-black/40 px-2 py-1 rounded-full border border-white/5">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                    Live
                </div>
            </div>

            {/* List */}
            <div className="p-8 space-y-8 max-h-[600px] overflow-y-auto custom-scrollbar">
                {comments.length === 0 ? (
                    <div className="py-20 text-center space-y-3">
                        <MessageSquare className="w-12 h-12 text-zinc-800 mx-auto opacity-20" />
                        <p className="text-sm text-zinc-500 italic max-w-xs mx-auto">No activity yet. Share your thoughts or feedback on this documentation.</p>
                    </div>
                ) : (
                    comments.map(comment => (
                        <div key={comment.id} className="space-y-6">
                            {/* Parent Comment */}
                            <div className="flex gap-4 group">
                                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-lg shadow-black/40">
                                    {comment.user.image ? (
                                        <img src={comment.user.image} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="font-black text-white text-xs">{(comment.user.name || "U")[0].toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-zinc-100">{comment.user.name || "Colleague"}</span>
                                            <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">
                                                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                            </span>
                                            {comment.createdAt !== comment.createdAt && ( // Placeholder for updated check if we add updatedAt to interface
                                                <span className="text-[9px] text-zinc-700 italic lowercase">(edited)</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                                                className="text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-colors"
                                            >
                                                Reply
                                            </button>
                                            {session?.user?.id === (comment as any).userId && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            setEditingCommentId(comment.id);
                                                            setEditContent(comment.content);
                                                        }}
                                                        className="text-[10px] font-black uppercase text-zinc-500 hover:text-primary transition-colors"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(comment.id)}
                                                        className="text-[10px] font-black uppercase text-zinc-500 hover:text-rose-500 transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {editingCommentId === comment.id ? (
                                        <div className="space-y-2 mt-2">
                                            <textarea
                                                value={editContent}
                                                onChange={(e) => setEditContent(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="ghost" onClick={() => setEditingCommentId(null)} className="h-7 text-[10px] uppercase font-black">Cancel</Button>
                                                <Button size="sm" onClick={() => handleEdit(comment.id)} disabled={sending} className="h-7 text-[10px] uppercase font-black">Save Changes</Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                                    )}
                                </div>
                            </div>

                            {/* Replies */}
                            {comment.replies.length > 0 && (
                                <div className="ml-14 space-y-6 border-l border-white/5 pl-6">
                                    {comment.replies.map(reply => (
                                        <div key={reply.id} className="flex gap-4 group/reply">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                                                {reply.user.image ? (
                                                    <img src={reply.user.image} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="font-bold text-white/50 text-[10px]">{(reply.user.name || "U")[0].toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-xs text-zinc-300">{reply.user.name}</span>
                                                        <span className="text-[9px] text-zinc-700 uppercase font-black">
                                                            {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    {session?.user?.id === reply.userId && !editingCommentId && (
                                                        <div className="flex items-center gap-2 opacity-0 group-hover/reply:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCommentId(reply.id);
                                                                    setEditContent(reply.content);
                                                                }}
                                                                className="text-[9px] font-black uppercase text-zinc-600 hover:text-primary transition-colors"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(reply.id)}
                                                                className="text-[9px] font-black uppercase text-zinc-600 hover:text-rose-500 transition-colors"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                {editingCommentId === reply.id ? (
                                                    <div className="space-y-2 mt-1">
                                                        <textarea
                                                            value={editContent}
                                                            onChange={(e) => setEditContent(e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => setEditingCommentId(null)} className="text-[9px] font-black uppercase text-zinc-500">Cancel</button>
                                                            <button onClick={() => handleEdit(reply.id)} className="text-[9px] font-black uppercase text-primary">Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-zinc-500 text-sm leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Reply Input */}
                            {replyTo === comment.id && (
                                <form onSubmit={handleSubmit} className="ml-14 animate-in slide-in-from-left-2 duration-300">
                                    <div className="flex gap-2 p-2 bg-black/40 border border-white/10 rounded-2xl">
                                        <input
                                            type="text"
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            placeholder={`Reply to ${comment.user.name}...`}
                                            className="flex-1 bg-transparent border-none focus:ring-0 text-xs text-white px-2 h-8"
                                            autoFocus
                                        />
                                        <button
                                            type="submit"
                                            disabled={sending || !newComment.trim()}
                                            className="px-3 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-30 transition-all font-black text-[10px] uppercase tracking-widest"
                                        >
                                            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Post"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReplyTo(null)}
                                            className="p-2 text-zinc-600 hover:text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Main Input */}
            {!replyTo && (
                <div className="p-6 bg-white/[0.01] border-t border-white/5">
                    <form onSubmit={handleSubmit} className="relative group">
                        <textarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                            placeholder="Add a comment to this documentation..."
                            className="w-full bg-black/40 border border-white/10 rounded-[1.5rem] p-4 pr-14 text-sm text-white focus:ring-1 focus:ring-primary outline-none transition-all resize-none h-24 placeholder:text-zinc-600"
                        />
                        <button
                            type="submit"
                            disabled={sending || !newComment.trim()}
                            className="absolute bottom-4 right-4 p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-30 transition-all"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </form>
                </div>
            )}

            <div className="p-4 bg-black/40 border-t border-white/5 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-700">Team Collaboration &bull; DocuMint AI</p>
            </div>
        </div>
    );
}
