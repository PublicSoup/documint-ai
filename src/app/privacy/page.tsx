import Link from "next/link";

export default function PrivacyPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-24 text-gray-300">
            <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
            <p className="mb-4">Last Updated: January 14, 2026</p>

            <section className="space-y-6">
                <h2 className="text-2xl font-semibold text-white">1. Data Collection</h2>
                <p>DocuMint AI collects minimal data necessary to provide our services, including user email addresses for authentication and codebase metadata for documentation generation.</p>

                <h2 className="text-2xl font-semibold text-white">2. AI Processing</h2>
                <p>Your code is processed using secure AI models. We do not use your proprietary code to train global models. Local processing via LM Studio ensures data stays on your hardware when configured.</p>

                <h2 className="text-2xl font-semibold text-white">3. Third-Party Services</h2>
                <p>We use Stripe for payment processing and Resend for transactional emails. These services have their own privacy policies.</p>

                <h2 className="text-2xl font-semibold text-white">4. Contact Us</h2>
                <p>For privacy concerns, contact: support@documint.ai</p>
            </section>

            <div className="mt-12">
                <Link href="/" className="text-primary hover:underline">← Back to Home</Link>
            </div>
        </div>
    );
}
