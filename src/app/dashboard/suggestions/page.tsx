import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function SuggestionsPage() {
    const session = await getServerSession(authOptions);
    if (!session) redirect("/auth/login");

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            <header className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-xl bg-primary/20 text-primary">
                        <Zap className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">Beta</span>
                </div>
                <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">AI Suggestions</h1>
                <p className="text-muted-foreground text-sm font-medium">Context-aware refactoring and performance insights for your codebase.</p>
            </header>

            <Card className="glass-card border-white/5 min-h-[400px] flex items-center justify-center text-center">
                <CardContent className="space-y-6 max-w-md">
                    <div className="w-16 h-16 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center mx-auto">
                        <Sparkles className="w-8 h-8 text-white/20" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white">No active suggestions</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Start by selecting a file in your dashboard and choosing "Generate Suggestions" from the AI menu to see insights here.
                        </p>
                    </div>
                    <Link href="/dashboard">
                        <Button className="h-12 px-10 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest">
                            Back to Dashboard
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}
