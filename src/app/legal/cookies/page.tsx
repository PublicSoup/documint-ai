export default function LegalCookiesPage() {
  return (
    <main className="min-h-screen bg-[#030014] text-white px-6 py-16">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-3">Legal</p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-6">Cookie Policy</h1>
        <div className="space-y-5 text-white/70 leading-relaxed">
          <p>
            DocuMint AI uses essential cookies for authentication, security, and core product functionality.
          </p>
          <p>
            We may also use performance and analytics cookies to improve onboarding, reliability, and feature quality.
          </p>
          <p>
            By continuing to use the service, you consent to cookie usage as described in our Privacy Policy.
          </p>
        </div>
      </div>
    </main>
  );
}
