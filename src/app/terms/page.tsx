import Link from "next/link";

export default function TermsPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-24 text-gray-300">
            <h1 className="text-4xl font-bold text-white mb-8">Terms of Service</h1>
            <p className="mb-4">Last Updated: January 14, 2026</p>

            <section className="space-y-6">
                <h2 className="text-2xl font-semibold text-white">1. Use of Service</h2>
                <p>By using DocuMint AI, you agree to provide accurate information and use the service for its intended purpose of code documentation and analysis.</p>

                <h2 className="text-2xl font-semibold text-white">2. Subscription & Payments</h2>
                <p>Billing is handled through Stripe. Subscriptions automatically renew unless cancelled. Trials are available for the Pro plan for 14 days.</p>

                <h2 className="text-2xl font-semibold text-white">3. Intellectual Property</h2>
                <p>You retain all rights to your original source code. DocuMint AI retains rights to its proprietary algorithms and UI.</p>

                <h2 className="text-2xl font-semibold text-white">4. Limitation of Liability</h2>
                <p>DocuMint AI is provided "as is". We are not responsible for any issues arising from the use of AI-generated documentation in production environments.</p>
            </section>

            <div className="mt-12">
                <Link href="/" className="text-primary hover:underline">← Back to Home</Link>
            </div>
        </div>
    );
}
