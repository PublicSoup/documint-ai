import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function LegalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#0A0A0B] text-white/80">
            <header className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="font-bold text-white tracking-tight flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                        DocuMint AI
                    </Link>
                </div>
            </header>
            <main className="max-w-4xl mx-auto px-6 py-12 prose prose-invert prose-headings:text-white prose-a:text-primary">
                {children}
            </main>
            <footer className="border-t border-white/5 py-12 mt-12">
                <div className="max-w-4xl mx-auto px-6 text-center text-sm text-muted-foreground">
                    &copy; {new Date().getFullYear()} DocuMint AI. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
