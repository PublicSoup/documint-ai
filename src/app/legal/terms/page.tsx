"use client";

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Shield, Users } from 'lucide-react';

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            <div className="container mx-auto px-4 py-16 max-w-4xl">
                {/* Header */}
                <div className="text-center mb-12">
                    <Link href="/" className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors mb-6">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Home
                    </Link>
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <FileText className="w-8 h-8 text-blue-400" />
                        <h1 className="text-4xl font-bold">Terms of Service</h1>
                    </div>
                    <p className="text-slate-400 text-lg">Last updated: January 13, 2025</p>
                </div>

                {/* Content */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 space-y-8">
                    {/* Introduction */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">1. Introduction</h2>
                        <p className="text-slate-300 leading-relaxed">
                            Welcome to DocuMint AI. These Terms of Service ("Terms") govern your access to and use of
                            our AI-powered code documentation generation service, website, and related services
                            (collectively, the "Service"). Please read these Terms carefully before using our Service.
                        </p>
                        <p className="text-slate-300 leading-relaxed mt-4">
                            By accessing or using DocuMint AI, you agree to be bound by these Terms and our Privacy Policy.
                            If you disagree with any part of these terms, you may not access the Service.
                        </p>
                    </section>

                    {/* Account Terms */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">2. Account Terms</h2>
                        <ul className="text-slate-300 space-y-3">
                            <li>• You must be at least 18 years old to use this Service.</li>
                            <li>• You are responsible for maintaining the security of your account and password.</li>
                            <li>• You are responsible for all content posted and activity that occurs under your account.</li>
                            <li>• You may not use the Service for any illegal or unauthorized purpose.</li>
                            <li>• You must not transmit any worms, viruses or any code of a destructive nature.</li>
                        </ul>
                    </section>

                    {/* Service Description */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">3. Service Description</h2>
                        <p className="text-slate-300 leading-relaxed">
                            DocuMint AI provides AI-powered code documentation generation services. We offer:
                        </p>
                        <ul className="text-slate-300 space-y-2 mt-3">
                            <li>• Automated code documentation generation</li>
                            <li>• Code quality analysis and insights</li>
                            <li>• Team collaboration features</li>
                            <li>• Export capabilities in multiple formats</li>
                            <li>• Integration with GitHub and other platforms</li>
                        </ul>
                    </section>

                    {/* Payment and Billing */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">4. Payment and Billing</h2>
                        <p className="text-slate-300 leading-relaxed">
                            Our Service is available under various subscription plans. Key billing terms include:
                        </p>
                        <ul className="text-slate-300 space-y-2 mt-3">
                            <li>• Subscriptions are billed in advance on a recurring basis</li>
                            <li>• All fees are exclusive of applicable taxes</li>
                            <li>• You may cancel your subscription at any time</li>
                            <li>• Refunds are provided at our discretion</li>
                            <li>• We reserve the right to change pricing with 30 days notice</li>
                        </ul>
                    </section>

                    {/* User Content */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">5. User Content</h2>
                        <p className="text-slate-300 leading-relaxed">
                            You retain all rights to the code and content you upload to DocuMint AI. By using our Service, you grant us:
                        </p>
                        <ul className="text-slate-300 space-y-2 mt-3">
                            <li>• A limited license to process your content for the purpose of providing the Service</li>
                            <li>• The right to store and backup your content on our secure servers</li>
                            <li>• The right to use aggregated, anonymized data for service improvement</li>
                        </ul>
                    </section>

                    {/* Prohibited Uses */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">6. Prohibited Uses</h2>
                        <p className="text-slate-300 leading-relaxed">
                            You agree not to use the Service:
                        </p>
                        <ul className="text-slate-300 space-y-2 mt-3">
                            <li>• In violation of any laws or regulations</li>
                            <li>• To infringe on intellectual property rights</li>
                            <li>• To transmit spam or malicious code</li>
                            <li>• To harass, abuse, or harm others</li>
                            <li>• To interfere with the Service's operation</li>
                        </ul>
                    </section>

                    {/* Termination */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">7. Termination</h2>
                        <p className="text-slate-300 leading-relaxed">
                            We may terminate or suspend your account and access to the Service immediately, without prior notice,
                            for conduct that we believe violates these Terms or is harmful to other users, us, or third parties,
                            or for any other reason.
                        </p>
                    </section>

                    {/* Disclaimer */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">8. Disclaimer</h2>
                        <p className="text-slate-300 leading-relaxed">
                            The Service is provided "as is" without warranties of any kind. We do not guarantee that:
                        </p>
                        <ul className="text-slate-300 space-y-2 mt-3">
                            <li>• The Service will be uninterrupted or error-free</li>
                            <li>• The documentation generated will be perfect or complete</li>
                            <li>• The Service will meet your specific requirements</li>
                        </ul>
                    </section>

                    {/* Limitation of Liability */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">9. Limitation of Liability</h2>
                        <p className="text-slate-300 leading-relaxed">
                            To the maximum extent permitted by law, DocuMint AI shall not be liable for any indirect,
                            incidental, special, consequential, or punitive damages, or any loss of profits or revenues,
                            whether incurred directly or indirectly.
                        </p>
                    </section>

                    {/* Changes to Terms */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">10. Changes to Terms</h2>
                        <p className="text-slate-300 leading-relaxed">
                            We reserve the right to modify these Terms at any time. We will provide notice of significant
                            changes through the Service or by email. Continued use of the Service after changes constitutes
                            acceptance of the new Terms.
                        </p>
                    </section>

                    {/* Contact Information */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-blue-400">11. Contact Information</h2>
                        <p className="text-slate-300 leading-relaxed">
                            Questions about these Terms should be sent to us at:{' '}
                            <a href="mailto:legal@documint.ai" className="text-blue-400 hover:text-blue-300">
                                legal@documint.ai
                            </a>
                        </p>
                    </section>
                </div>

                {/* Footer */}
                <div className="text-center mt-12 text-slate-400">
                    <p>© 2025 DocuMint AI. All rights reserved.</p>
                </div>
            </div>
        </div>
    );
}
