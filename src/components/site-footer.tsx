'use client';

import Link from 'next/link';
import React from 'react';

export function SiteFooter() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-gray-900 text-gray-300 border-t border-gray-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Company Info */}
                    <div className="md:col-span-2">
                        <h3 className="text-white font-bold text-lg mb-4">DocuMint AI</h3>
                        <p className="text-gray-400 mb-4">
                            The AI-powered documentation engine that understands your codebase.
                            Generate comprehensive docs, audits, and diagrams automatically.
                        </p>
                        <div className="flex space-x-4">
                            <Link
                                href="https://github.com/documintai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                GitHub
                            </Link>
                            <Link
                                href="https://twitter.com/documint_ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                Twitter
                            </Link>
                            <a
                                href="mailto:support@documint.ai"
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                Contact
                            </a>
                        </div>
                    </div>

                    {/* Product Links */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Product</h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/dashboard"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Dashboard
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/dashboard/analytics"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Analytics
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/dashboard/billing"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Billing
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/dashboard/settings"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Settings
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Legal Links */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Legal</h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href="/legal/terms"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/legal/privacy"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/legal/security"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Security
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href="/legal/cookies"
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    Cookie Policy
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-gray-700 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center">
                    <p className="text-gray-500 text-sm">
                        © {currentYear} DocuMint AI. All rights reserved.
                    </p>
                    <div className="flex space-x-4 mt-4 md:mt-0">
                        <Link
                            href="/legal/terms"
                            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                        >
                            Terms
                        </Link>
                        <Link
                            href="/legal/privacy"
                            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                        >
                            Privacy
                        </Link>
                        <Link
                            href="/legal/security"
                            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                        >
                            Security
                        </Link>
                        <Link
                            href="/support"
                            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                        >
                            Support
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
