import Link from "next/link";

export default function LegalSecurityPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-3">Legal</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Security Overview</h1>
        <div className="space-y-5 text-white/70 leading-relaxed">
          <p>
            DocuMint AI applies layered access control, request validation, rate limiting, and auditable mutation
            workflows to support secure software delivery.
          </p>
          <p>
            For enterprise security questionnaires, contact
            <a className="text-primary hover:text-primary/80" href="mailto:support@documint.ai"> support@documint.ai</a>.
          </p>
          <p>
            Operational security controls evolve continuously as part of our enterprise hardening roadmap.
          </p>
        </div>
        <div className="mt-10">
          <Link href="/security" className="text-primary hover:text-primary/80">View public security page →</Link>
        </div>
      </div>
    </main>
  );
}
