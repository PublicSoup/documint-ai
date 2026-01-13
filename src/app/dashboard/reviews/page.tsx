import { ReviewList } from "@/components/review-list";
import { CheckSquare, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
    title: "AI PR Reviews | DocuMint AI",
    description: "Intelligent code and documentation review audit"
};

export default function ReviewsPage() {
    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in relative z-10 space-y-8">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <ShieldCheck className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">AI Audit Reviews</h1>
                        <p className="text-muted-foreground flex items-center gap-2">
                            Review documentation updates for production readiness.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm flex items-center gap-2">
                        <Zap className="w-4 h-4 text-purple-400" />
                        <span className="text-white/70">Review Speed: <span className="text-white font-semibold">1.2s avg</span></span>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-6">
                <Card className="glass-card border-none bg-transparent">
                    <CardHeader className="px-0">
                        <CardTitle className="text-xl">Pending Approvals</CardTitle>
                        <CardDescription>Documentation changes waiting for your review.</CardDescription>
                    </CardHeader>
                    <CardContent className="px-0">
                        <ReviewList />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

