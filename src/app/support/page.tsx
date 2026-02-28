import Link from "next/link";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-3">Support</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Need help with DocuMint AI?</h1>
        <div className="space-y-5 text-white/70 leading-relaxed">
          <p>
            For account, billing, and product support, contact
            <a className="text-primary hover:text-primary/80" href="mailto:support@documint.ai"> support@documint.ai</a>.
          </p>
          <p>
            For enterprise onboarding and security reviews, visit our
            <Link href="/security" className="text-primary hover:text-primary/80"> security overview</Link>
            {" "}or contact the team at support.
          </p>
        </div>
        <div className="mt-10">
          <Link href="/docs" className="text-primary hover:text-primary/80">Browse documentation →</Link>
        </div>
      </div>
    </main>
  );
}
