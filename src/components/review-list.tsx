"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, Clock, FileText, User, ChevronRight, MessageSquare, AlertCircle, Sparkles, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Review {
    id: string;
    status: string;
    createdAt: string;
    comments: string;
    documentation: {
        file: { name: string, id: string }
    };
    requester: { name: string; image: string };
    reviewer?: { name: string };
}

import { useToast } from "./toast";

export function ReviewList() {
    const { toast } = useToast();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchReviews();
    }, []);

    const fetchReviews = async () => {
        try {
            const res = await fetch("/api/reviews");
            const data = await res.json();
            if (res.ok) setReviews(data.reviews);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id: string, action: "APPROVED" | "CHANGES_REQUESTED") => {
        const comment = action === "APPROVED" ? "Approved via AI Audit" : "Changes needed for documentation accuracy";

        try {
            const res = await fetch(`/api/reviews/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: action, comments: comment })
            });

            if (res.ok) {
                fetchReviews(); // Refresh
                router.refresh();
                toast(action === "APPROVED" ? "Documentation Approved" : "Changes Requested", "success");
            } else {
                toast("Action failed", "error");
            }
        } catch (e) {
            toast("Error processing review", "error");
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2].map(i => (
                    <div key={i} className="h-24 glass-card animate-pulse" />
                ))}
            </div>
        );
    }

    if (reviews.length === 0) {
        return (
            <Card className="glass-card border-dashed bg-transparent">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <ShieldCheck className="w-8 h-8 text-white/20" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Clear for Launch</h3>
                    <p className="text-muted-foreground max-w-sm">
                        All documentation is up to date and approved. You're completely caught up!
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {reviews.map((review) => (
                <Card key={review.id} className="glass-card bg-black/40 hover:bg-black/60 transition-all border-white/5 group overflow-hidden">
                    <CardContent className="p-0">
                        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-start gap-5">
                                <div className={`mt-1 w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${review.status === "APPROVED" ? "bg-green-500/10 text-green-400 border border-green-500/20" :
                                        review.status === "CHANGES_REQUESTED" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                                            "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                    }`}>
                                    {review.status === "APPROVED" ? <CheckCircle className="w-6 h-6" /> :
                                        review.status === "CHANGES_REQUESTED" ? <AlertCircle className="w-6 h-6" /> :
                                            <Clock className="w-6 h-6" />}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-white text-lg">
                                            {review.documentation.file.name}
                                        </h4>
                                        <Link href={`/dashboard?docId=${review.documentation.file.id}`}>
                                            <ArrowUpRight className="w-4 h-4 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                                        </Link>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1.5 font-medium text-white/60">
                                            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary">
                                                {review.requester.name?.[0] || "U"}
                                            </div>
                                            {review.requester.name}
                                        </div>
                                        <span>•</span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(review.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {review.status === "PENDING" ? (
                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleAction(review.id, "CHANGES_REQUESTED")}
                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                                    >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Request Changes
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => handleAction(review.id, "APPROVED")}
                                        className="shadow-lg shadow-green-500/20"
                                    >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Approve Docs
                                    </Button>
                                </div>
                            ) : (
                                <div className={`px-4 py-1.5 rounded-xl text-xs font-bold border ${review.status === "APPROVED" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                                        "bg-red-500/10 text-red-400 border-red-500/20"
                                    }`}>
                                    {review.status.replace("_", " ")}
                                </div>
                            )}
                        </div>

                        {review.comments && (
                            <div className="px-6 py-4 bg-white/5 border-t border-white/5 flex gap-3 text-sm italic text-muted-foreground">
                                <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                <p>{review.comments.split('\n').pop()}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function ShieldCheck(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}

