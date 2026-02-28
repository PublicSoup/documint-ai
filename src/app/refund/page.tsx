import Link from "next/link";

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-3">Legal</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Refund Policy</h1>
        <div className="space-y-5 text-white/70 leading-relaxed">
          <p>
            DocuMint AI subscriptions are billed in advance. If you experience a billing issue or accidental charge,
            contact <a className="text-primary hover:text-primary/80" href="mailto:support@documint.ai">support@documint.ai</a> within 14 days of the charge date.
          </p>
          <p>
            We review refund requests case-by-case and prioritize fair outcomes for customers with verified service-impacting issues.
          </p>
          <p>
            For annual agreements and enterprise plans, refund and cancellation terms are governed by your signed order form.
          </p>
        </div>
        <div className="mt-10">
          <Link href="/terms" className="text-primary hover:text-primary/80">Read Terms of Service →</Link>
        </div>
      </div>
    </main>
  );
}
