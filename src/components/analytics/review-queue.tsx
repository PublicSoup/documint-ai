"use client";

import { useState, useEffect } from "react";
import { 
    Clock, Eye, CheckCircle2, User, 
    ArrowRight, Loader2, MessageSquare, ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

interface Review {
    id: string;
    fileId: string;
    status: string;
    updatedAt: string;
    file: {
        name: string;
        language: string;
    };
    reviews: {
        requester: {
            name: string | null;
            image: string | null;
        };
    }[];
}

export function TeamReviewQueue({ teamId }: { teamId: string }) {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReviews = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/teams/${teamId}/reviews`);
                if (res.ok) {
                    const data = await res.json();
                    setReviews(data.reviews || []);
                }
            } catch (e) {
                console.error("Failed to fetch reviews:", e);
            } finally {
                setLoading(false);
            }
        };

        if (teamId) fetchReviews();
    }, [teamId]);

    if (loading) {
        return <div className="h-[200px] bg-white/5 border border-white/10 rounded-3xl animate-pulse" />;
    }

    if (reviews.length === 0) return null;

    return (
        <Card className="glass-card border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Review Queue</span>
                </div>
                <div className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase animate-pulse">
                    {reviews.length} Pending
                </div>
            </div>

            <CardContent className="p-0">
                <div className="divide-y divide-white/5">
                    {reviews.map((review) => (
                        <Link 
                            key={review.id}
                            href={`/dashboard?teamId=${teamId}&docId=${review.fileId}`}
                            className="flex items-center justify-between p-4 hover:bg-white/5 transition-all group"
                        >
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                    <MessageSquare className="w-5 h-5 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
                                        {review.file.name}
                                    </h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                                            <User className="w-3 h-3" />
                                            <span>{review.reviews[0]?.requester.name || "Colleague"}</span>
                                        </div>
                                        <span className="text-zinc-700 text-[10px]">•</span>
                                        <span className="text-[10px] text-zinc-500 uppercase font-black">{review.file.language}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <div className="text-right hidden sm:block">
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Waiting</p>
                                    <p className="text-xs text-white/70 font-mono">
                                        {new Date(review.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
