"use client";

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, Lock, EyeOff, Database, Mail } from 'lucide-react';

export default function PrivacyPolicy() {
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
                        <Shield className="w-8 h-8 text-green-400" />
                        <h1 className="text-4xl font-bold">Privacy Policy</h1>
                    </div>
                    <p className="text-slate-400 text-lg">Last updated: January 13, 2025</p>
                </div>

                {/* Content */}
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 space-y-8">
                    {/* Introduction */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">1. Introduction</h2>
                        <p className="text-slate-300 leading-relaxed">
                            At DocuMint AI, we take your privacy seriously. This Privacy Policy explains how we collect,
                            use, disclose, and safeguard your information when you use our AI-powered code documentation
                            generation service.
                        </p>
                        <p className="text-slate-300 leading-relaxed mt-4">
                            By using DocuMint AI, you consent to the data practices described in this policy. If you do
                            not agree with the terms of this Privacy Policy, please do not access the Service.
                        </p>
                    </section>

                    {/* Information We Collect */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">2. Information We Collect</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-slate-700/50 p-4 rounded-lg">
                                <div className="flex items-center gap-2 mb-3">
                                    <Mail className="w-5 h-5 text-blue-400" />
                                    <h3 className="font-semibold">Personal Information</h3>
                                </div>
                                <ul className="text-slate-300 space-y-2 text-sm">
                                    <li>• Name and email address</li>
                                    <li>• Account credentials</li>
                                    <li>• Payment information (via Stripe)</li>
                                    <li>• Profile information and preferences</li>
                                </ul>
                            </div>
                            <div className="bg-slate-700/50 p-4 rounded-lg">
                                <div className="flex items-center gap-2 mb-3">
                                    <Database className="w-5 h-5 text-purple-400" />
                                    <h3 className="font-semibold">Technical Information</h3>
                                </div>
                                <ul className="text-slate-300 space-y-2 text-sm">
                                    <li>• IP address and browser information</li>
                                    <li>• Device information and operating system</li>
                                    <li>• Usage statistics and analytics</li>
                                    <li>• Error logs and performance data</li>
                                </ul>
                            </div>
                        </div>
                        <div className="bg-slate-700/50 p-4 rounded-lg mt-4">
                            <div className="flex items-center gap-2 mb-3">
                                <EyeOff className="w-5 h-5 text-red-400" />
                                <h3 className="font-semibold">Code Content</h3>
                            </div>
                            <p className="text-slate-300 text-sm">
                                We process the code you upload to generate documentation. This content is:
                            </p>
                            <ul className="text-slate-300 space-y-1 text-sm mt-2">
                                <li>• Processed securely and temporarily</li>
                                <li>• Not stored permanently unless you save it</li>
                                <li>• Never shared with third parties</li>
                                <li>• Protected by strict access controls</li>
                            </ul>
                        </div>
                    </section>

                    {/* How We Use Information */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">3. How We Use Information</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-slate-700/50 p-4 rounded-lg">
                                <h3 className="font-semibold mb-3 text-blue-400">Service Operation</h3>
                                <ul className="text-slate-300 space-y-2 text-sm">
                                    <li>• Provide and maintain the Service</li>
                                    <li>• Process payments and subscriptions</li>
                                    <li>• Authenticate users and secure accounts</li>
                                    <li>• Send service-related communications</li>
                                </ul>
                            </div>
                            <div className="bg-slate-700/50 p-4 rounded-lg">
                                <h3 className="font-semibold mb-3 text-purple-400">Service Improvement</h3>
                                <ul className="text-slate-300 space-y-2 text-sm">
                                    <li>• Analyze usage patterns and trends</li>
                                    <li>• Improve AI models and algorithms</li>
                                    <li>• Fix bugs and optimize performance</li>
                                    <li>• Develop new features</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Data Sharing */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">4. Data Sharing and Disclosure</h2>
                        <p className="text-slate-300 leading-relaxed">
                            We do not sell, trade, or rent your personal information to third parties. We may share
                            information with:
                        </p>
                        <ul className="text-slate-300 space-y-2 mt-3">
                            <li>• <strong>Service Providers:</strong> Trusted partners who help us operate our Service
                                (payment processors, hosting providers)</li>
                            <li>• <strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                            <li>• <strong>Business Transfers:</strong> In connection with a merger or acquisition</li>
                        </ul>
                        <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-4 mt-4">
                            <p className="text-yellow-300 text-sm">
                                <strong>Important:</strong> We use Stripe for payment processing. Your payment information
                                is handled directly by Stripe and never touches our servers.
                            </p>
                        </div>
                    </section>

                    {/* Data Security */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">5. Data Security</h2>
                        <div className="flex items-center gap-3 mb-4">
                            <Lock className="w-6 h-6 text-green-400" />
                            <h3 className="font-semibold">We Protect Your Data</h3>
                        </div>
                        <ul className="text-slate-300 space-y-3">
                            <li>• Encryption of data in transit and at rest</li>
                            <li>• Secure server infrastructure with regular updates</li>
                            <li>• Access controls and authentication mechanisms</li>
                            <li>• Regular security audits and monitoring</li>
                            <li>• Employee training on data protection</li>
                        </ul>
                    </section>

                    {/* User Rights */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">6. Your Rights</h2>
                        <p className="text-slate-300 leading-relaxed">
                            You have the right to:
                        </p>
                        <ul className="text-slate-300 space-y-3 mt-3">
                            <li>• <strong>Access:</strong> Request a copy of your personal data</li>
                            <li>• <strong>Correction:</strong> Update or correct your information</li>
                            <li>• <strong>Deletion:</strong> Request deletion of your account and data</li>
                            <li>• <strong>Portability:</strong> Export your data in a portable format</li>
                            <li>• <strong>Restriction:</strong> Limit how we use your data</li>
                        </ul>
                        <p className="text-slate-400 text-sm mt-4">
                            To exercise these rights, please contact us at{' '}
                            <a href="mailto:privacy@documint.ai" className="text-blue-400 hover:text-blue-300">
                                privacy@documint.ai
                            </a>
                        </p>
                    </section>

                    {/* Data Retention */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">7. Data Retention</h2>
                        <p className="text-slate-300 leading-relaxed">
                            We retain your personal information only for as long as necessary to fulfill the purposes
                            outlined in this Privacy Policy, unless a longer retention period is required or permitted by law.
                        </p>
                        <ul className="text-slate-300 space-y-2 mt-3">
                            <li>• Account data: Until account deletion</li>
                            <li>• Code content: Temporary processing, permanent if saved</li>
                            <li>• Payment records: As required by accounting laws</li>
                            <li>• Analytics data: Aggregated and anonymized</li>
                        </ul>
                    </section>

                    {/* International Transfers */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">8. International Data Transfers</h2>
                        <p className="text-slate-300 leading-relaxed">
                            Your information may be processed in countries other than your own. We ensure appropriate
                            safeguards are in place to protect your data in compliance with applicable data protection laws.
                        </p>
                    </section>

                    {/* Children's Privacy */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">9. Children's Privacy</h2>
                        <p className="text-slate-300 leading-relaxed">
                            Our Service is not intended for individuals under the age of 18. We do not knowingly
                            collect personal information from children. If you believe we have collected information
                            from a child, please contact us immediately.
                        </p>
                    </section>

                    {/* Changes to Policy */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">10. Changes to This Policy</h2>
                        <p className="text-slate-300 leading-relaxed">
                            We may update this Privacy Policy from time to time. We will notify you of any changes by
                            posting the new Privacy Policy on this page and updating the "Last updated" date.
                        </p>
                    </section>

                    {/* Contact Information */}
                    <section>
                        <h2 className="text-2xl font-semibold mb-4 text-green-400">11. Contact Us</h2>
                        <p className="text-slate-300 leading-relaxed">
                            If you have any questions about this Privacy Policy, please contact us:
                        </p>
                        <div className="mt-4 space-y-2">
                            <p className="text-slate-300">
                                <strong>Email:</strong>{' '}
                                <a href="mailto:privacy@documint.ai" className="text-blue-400 hover:text-blue-300">
                                    privacy@documint.ai
                                </a>
                            </p>
                            <p className="text-slate-300">
                                <strong>Address:</strong> 123 Developer Street, Tech City, TC 12345
                            </p>
                        </div>
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
